import { APIGatewayProxyHandler } from 'aws-lambda';
import { DatabaseError } from 'pg';
import { getAnalysisResultForViewer } from '../services/auditLog';
import {
  upsertSavedSummary,
  listSavedSummaries,
  renameSavedSummaryFileName,
  deleteSavedSummary
} from '../services/savedSummaries';
import { listSharedWithMe, type SharedWithMeRow } from '../services/documentShares';
import type { AnalysisType } from '../types';
import { getCognitoSubFromEvent } from '../utils/cognitoClaims';
import { isValidAnalysisType, isUuidString } from '../utils/validators';
import { CORS_HEADERS } from '../utils/cors';

function parseSaveBody(raw: unknown): {
  documentId: string;
  fileName: string;
  summary: string;
  analysisType: string;
  phiDetected: boolean;
  entitiesRedacted: number;
  modelUsed: string;
} | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const documentId =
    typeof o.documentId === 'string' ? o.documentId.trim() : '';
  if (!documentId || !isUuidString(documentId)) return null;
  if (typeof o.fileName !== 'string' || !o.fileName.trim()) return null;
  if (typeof o.summary !== 'string') return null;
  if (!isValidAnalysisType(o.analysisType)) return null;
  const phiDetected = Boolean(o.phiDetected);
  const entitiesRedacted =
    typeof o.entitiesRedacted === 'number' && Number.isFinite(o.entitiesRedacted)
      ? Math.max(0, Math.floor(o.entitiesRedacted))
      : 0;
  const modelUsed = typeof o.modelUsed === 'string' && o.modelUsed.trim() ? o.modelUsed.trim() : 'unknown';
  return {
    documentId,
    fileName: o.fileName.trim(),
    summary: o.summary,
    analysisType: o.analysisType,
    phiDetected,
    entitiesRedacted,
    modelUsed
  };
}

/** Rename/delete via POST so browsers reuse the same CORS preflight as save (PATCH on a sub-path often fails until API deploy). */
function parsePostOp(
  raw: unknown
):
  | { op: 'rename'; documentId: string; fileName: string }
  | { op: 'delete'; documentId: string }
  | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (o.op !== 'rename' && o.op !== 'delete') return null;
  const documentId =
    typeof o.documentId === 'string' ? o.documentId.trim() : '';
  if (!documentId || !isUuidString(documentId)) return null;
  if (o.op === 'delete') {
    return { op: 'delete', documentId };
  }
  const fileName = typeof o.fileName === 'string' ? o.fileName.trim() : '';
  if (!fileName) return null;
  return { op: 'rename', documentId, fileName };
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const userId = getCognitoSubFromEvent(event);
    if (!userId) {
      return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const method = event.httpMethod;
    if (method === 'GET') {
      const items = await listSavedSummaries(userId);
      let sharedWithMe: SharedWithMeRow[] = [];
      try {
        sharedWithMe = await listSharedWithMe(userId);
      } catch (shareErr) {
        // Saved history should still load if shared-with-me fails (e.g. missing migration, bad join).
        console.error('listSharedWithMe failed:', shareErr);
      }
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ items, sharedWithMe })
      };
    }

    if (method === 'POST') {
      let body: unknown;
      try {
        body = JSON.parse(event.body || '{}');
      } catch {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Invalid JSON' })
        };
      }

      const postOp = parsePostOp(body);
      if (postOp) {
        if (postOp.op === 'rename') {
          try {
            const updated = await renameSavedSummaryFileName({
              userId,
              documentId: postOp.documentId,
              fileName: postOp.fileName
            });
            if (!updated) {
              return {
                statusCode: 404,
                headers: CORS_HEADERS,
                body: JSON.stringify({ error: 'Saved summary not found' })
              };
            }
            return {
              statusCode: 200,
              headers: CORS_HEADERS,
              body: JSON.stringify({ ok: true })
            };
          } catch (renameErr) {
            const msg =
              renameErr instanceof Error ? renameErr.message : 'Could not rename document in storage';
            return {
              statusCode: 400,
              headers: CORS_HEADERS,
              body: JSON.stringify({ error: msg })
            };
          }
        }
        const removed = await deleteSavedSummary(userId, postOp.documentId);
        if (!removed) {
          return {
            statusCode: 404,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: 'Saved summary not found' })
          };
        }
        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({ ok: true })
        };
      }

      const rawPost = body as Record<string, unknown>;
      if (rawPost.op === 'rename' || rawPost.op === 'delete') {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({
            error:
              'Invalid rename or delete request. Expected a UUID documentId and, for rename, a non-empty fileName.'
          })
        };
      }

      const parsed = parseSaveBody(body);
      if (!parsed) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Invalid request body' })
        };
      }
      const existing = await getAnalysisResultForViewer(parsed.documentId, userId);
      if (!existing || existing.analysis_status !== 'COMPLETE') {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({
            error: 'No completed analysis found for this document. Finish analysis before saving.'
          })
        };
      }
      await upsertSavedSummary({
        userId,
        documentId: parsed.documentId,
        fileName: parsed.fileName,
        analysisType: parsed.analysisType as AnalysisType,
        summary: parsed.summary,
        phiDetected: parsed.phiDetected,
        entitiesRedacted: parsed.entitiesRedacted,
        modelUsed: parsed.modelUsed
      });
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ ok: true })
      };
    }

    const pathDocId = event.pathParameters?.documentId;
    if (pathDocId && !isUuidString(pathDocId)) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Invalid document id' })
      };
    }

    if (method === 'PATCH' && pathDocId) {
      let body: unknown;
      try {
        body = JSON.parse(event.body || '{}');
      } catch {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Invalid JSON' })
        };
      }
      const o = body as Record<string, unknown>;
      const fileName = typeof o.fileName === 'string' ? o.fileName.trim() : '';
      if (!fileName) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'fileName is required' })
        };
      }
      try {
        const updated = await renameSavedSummaryFileName({
          userId,
          documentId: pathDocId,
          fileName
        });
        if (!updated) {
          return {
            statusCode: 404,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: 'Saved summary not found' })
          };
        }
        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({ ok: true })
        };
      } catch (renameErr) {
        const msg =
          renameErr instanceof Error ? renameErr.message : 'Could not rename document in storage';
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: msg })
        };
      }
    }

    if (method === 'DELETE' && pathDocId) {
      const removed = await deleteSavedSummary(userId, pathDocId);
      if (!removed) {
        return {
          statusCode: 404,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Saved summary not found' })
        };
      }
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ ok: true })
      };
    }

    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  } catch (error) {
    const pgCode =
      error instanceof DatabaseError
        ? error.code
        : typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code?: string }).code)
          : undefined;

    if (error instanceof DatabaseError) {
      console.error('savedSummaries pg error:', error.code, error.message, error.detail);
      if (error.code === '22P02') {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Invalid document id or data format' })
        };
      }
      if (error.code === '28P01') {
        return {
          statusCode: 503,
          headers: CORS_HEADERS,
          body: JSON.stringify({
            error:
              'Database login failed for analyzer_user. Deploy with export DB_PASSWORD=… then invoke RunDbSetup once so Postgres matches Lambda, or align passwords.'
          })
        };
      }
    }
    const err = error as Error;
    console.error('savedSummaries error:', pgCode ?? '—', err?.message ?? error, (err as Error)?.stack);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
