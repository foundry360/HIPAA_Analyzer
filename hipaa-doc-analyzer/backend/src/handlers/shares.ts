import { APIGatewayProxyHandler } from 'aws-lambda';
import { getAnalysisResult } from '../services/auditLog';
import {
  insertDocumentShare,
  listSharesForDocument,
  listSharedWithMe,
  deleteShare
} from '../services/documentShares';
import { resolveEmailToSub } from '../services/cognitoUserLookup';
import { CORS_HEADERS } from '../utils/cors';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const method = event.httpMethod;
    const path = event.path ?? '';

    if (method === 'GET' && path.includes('/incoming')) {
      const rows = await listSharedWithMe(userId);
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ items: rows })
      };
    }

    if (method === 'GET') {
      const documentId = event.queryStringParameters?.documentId;
      if (!documentId || !UUID_RE.test(documentId)) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Missing or invalid documentId' })
        };
      }
      const ownerRow = await getAnalysisResult(documentId, userId);
      if (!ownerRow) {
        return {
          statusCode: 404,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Document not found' })
        };
      }
      const shares = await listSharesForDocument(userId, documentId);
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ shares })
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
      const o = body as Record<string, unknown>;
      const documentId = typeof o.documentId === 'string' ? o.documentId : '';
      const email = typeof o.email === 'string' ? o.email.trim() : '';
      const fileName =
        typeof o.fileName === 'string' && o.fileName.trim()
          ? o.fileName.trim().slice(0, 512)
          : 'Document';

      if (!UUID_RE.test(documentId)) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Invalid documentId' })
        };
      }
      if (!email) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Invalid email' })
        };
      }

      const ownerRow = await getAnalysisResult(documentId, userId);
      if (!ownerRow || ownerRow.analysis_status !== 'COMPLETE') {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({
            error: 'Only completed analyses owned by you can be shared.'
          })
        };
      }

      let sub: string | null;
      try {
        sub = await resolveEmailToSub(email);
      } catch (e) {
        console.error('resolveEmailToSub:', e);
        return {
          statusCode: 500,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Could not look up user.' })
        };
      }
      if (!sub) {
        return {
          statusCode: 404,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'No user found with that email in this app.' })
        };
      }
      if (sub === userId) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'You cannot share with yourself.' })
        };
      }

      try {
        const row = await insertDocumentShare({
          documentId,
          ownerUserId: userId,
          sharedWithUserId: sub,
          fileName
        });
        return {
          statusCode: 201,
          headers: CORS_HEADERS,
          body: JSON.stringify({ share: row })
        };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === '23505') {
          return {
            statusCode: 409,
            headers: CORS_HEADERS,
            body: JSON.stringify({
              error: 'This user already has access to this document.'
            })
          };
        }
        throw e;
      }
    }

    if (method === 'DELETE') {
      const shareId = event.pathParameters?.shareId;
      if (!shareId || !UUID_RE.test(shareId)) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Missing or invalid shareId' })
        };
      }
      const ok = await deleteShare(shareId, userId);
      if (!ok) {
        return {
          statusCode: 404,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Share not found' })
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
    const err = error as Error & { code?: string };
    console.error('shares handler error:', err?.message ?? error, err?.stack);
    const pgCode = err?.code;
    if (pgCode === '42P01') {
      return {
        statusCode: 503,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error:
            'Sharing is unavailable: database table missing. Run DB setup / migration for document_shares.'
        })
      };
    }
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
