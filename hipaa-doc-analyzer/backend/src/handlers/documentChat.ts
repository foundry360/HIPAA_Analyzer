import { APIGatewayProxyHandler } from 'aws-lambda';
import { getAnalysisResultForViewer } from '../services/auditLog';
import { documentChatCompletion } from '../services/bedrock';
import { getCognitoSubFromEvent } from '../utils/cognitoClaims';
import { getTenantIdFromEvent } from '../utils/tenantContext';
import { isUuidString } from '../utils/validators';
import { CORS_HEADERS } from '../utils/cors';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

function parseBody(raw: unknown): { documentId: string; fileName: string; messages: ChatMessage[] } | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const documentId = typeof o.documentId === 'string' ? o.documentId.trim() : '';
  if (!documentId || !isUuidString(documentId)) return null;
  const fileName =
    typeof o.fileName === 'string' && o.fileName.trim() ? o.fileName.trim().slice(0, 512) : 'Document';
  if (!Array.isArray(o.messages)) return null;
  const messages: ChatMessage[] = [];
  for (const m of o.messages) {
    if (typeof m !== 'object' || m === null) return null;
    const r = (m as Record<string, unknown>).role;
    const c = (m as Record<string, unknown>).content;
    if (r !== 'user' && r !== 'assistant') return null;
    if (typeof c !== 'string' || !c.trim()) return null;
    messages.push({ role: r, content: c });
  }
  return { documentId, fileName, messages };
}

export const handler: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const userId = getCognitoSubFromEvent(event);
    if (!userId) {
      return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    const tenantId = getTenantIdFromEvent(event);

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

    const parsed = parseBody(body);
    if (!parsed) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'Invalid body: expected documentId (UUID), optional fileName, and messages[]'
        })
      };
    }

    const row = await getAnalysisResultForViewer(parsed.documentId, userId, tenantId);
    if (!row) {
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Document or analysis not found' })
      };
    }

    if (row.analysis_status === 'FAILED') {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Analysis failed for this document; chat is unavailable.' })
      };
    }

    if (
      (row.analysis_status === 'PENDING' || row.analysis_status === 'PROCESSING') &&
      !row.summary?.trim()
    ) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Analysis not complete yet; try again when the summary is ready.' })
      };
    }

    if (!row.summary?.trim()) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'No summary available for this document.' })
      };
    }

    const reply = await documentChatCompletion({
      summaryContext: row.summary,
      documentContext: row.redacted_document_text,
      fileLabel: parsed.fileName,
      messages: parsed.messages
    });

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ reply })
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Chat failed';
    console.error('documentChat error:', error);
    if (
      msg.includes('must') ||
      msg.includes('Messages') ||
      msg.includes('messages') ||
      msg.includes('Last message') ||
      msg.includes('First message') ||
      msg.includes('alternate')
    ) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: msg })
      };
    }
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Chat failed' })
    };
  }
};
