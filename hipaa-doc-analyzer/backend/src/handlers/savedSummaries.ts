import { APIGatewayProxyHandler } from 'aws-lambda';
import { getAnalysisResultForViewer } from '../services/auditLog';
import { upsertSavedSummary, listSavedSummaries } from '../services/savedSummaries';
import { listSharedWithMe, type SharedWithMeRow } from '../services/documentShares';
import type { AnalysisType } from '../types';
import { isValidAnalysisType } from '../utils/validators';
import { CORS_HEADERS } from '../utils/cors';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  if (typeof o.documentId !== 'string' || !UUID_RE.test(o.documentId)) return null;
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
    documentId: o.documentId,
    fileName: o.fileName.trim(),
    summary: o.summary,
    analysisType: o.analysisType,
    phiDetected,
    entitiesRedacted,
    modelUsed
  };
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const userId = event.requestContext.authorizer?.claims?.sub;
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

    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  } catch (error) {
    const err = error as Error;
    console.error('savedSummaries error:', err?.message ?? error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
