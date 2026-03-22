import { APIGatewayProxyHandler } from 'aws-lambda';
import { getAnalysisResult } from '../services/auditLog';
import {
  insertDocumentShare,
  listSharesForDocument,
  listSharedWithMe,
  deleteShare
} from '../services/documentShares';
import {
  resolveEmailToSub,
  resolveSubToEmail,
  searchUsersByEmailPrefix
} from '../services/cognitoUserLookup';
import { CORS_HEADERS } from '../utils/cors';
import { getCognitoSubFromEvent } from '../utils/cognitoClaims';
import { isUuidString } from '../utils/validators';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const userId = getCognitoSubFromEvent(event);
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

    if (method === 'GET' && path.includes('user-search')) {
      const q = event.queryStringParameters?.q ?? '';
      try {
        const users = await searchUsersByEmailPrefix(q, { excludeSub: userId, limit: 10 });
        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({ users })
        };
      } catch (e) {
        console.error('user-search:', e);
        return {
          statusCode: 500,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Could not search users.' })
        };
      }
    }

    if (method === 'GET') {
      const documentId = event.queryStringParameters?.documentId;
      if (!documentId || !isUuidString(documentId)) {
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
      const rows = await listSharesForDocument(userId, documentId);
      const shares = await Promise.all(
        rows.map(async (s) => {
          let displayEmail = s.shared_with_email?.trim() || null;
          if (!displayEmail) {
            displayEmail = (await resolveSubToEmail(s.shared_with_user_id)) ?? null;
          }
          return { ...s, shared_with_email: displayEmail };
        })
      );
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
      const emailRaw = typeof o.email === 'string' ? o.email.trim() : '';
      const email = emailRaw.toLowerCase();
      const fileName =
        typeof o.fileName === 'string' && o.fileName.trim()
          ? o.fileName.trim().slice(0, 512)
          : 'Document';

      if (!isUuidString(documentId)) {
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
        sub = await resolveEmailToSub(emailRaw);
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
          sharedWithEmail: email,
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
      if (!shareId || !isUuidString(shareId)) {
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
