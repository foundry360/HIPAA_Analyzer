import { APIGatewayProxyHandler } from 'aws-lambda';
import { getAnalysisResultForViewer } from '../services/auditLog';
import { getCognitoSubFromEvent } from '../utils/cognitoClaims';
import { isUuidString } from '../utils/validators';
import { CORS_HEADERS } from '../utils/cors';

/** Max characters returned for UI demo / sales preview (full text may be larger in DB). */
const MAX_PREVIEW_CHARS = 16_000;

export const handler: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod !== 'GET') {
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

    const documentId = event.pathParameters?.documentId?.trim() ?? '';
    if (!documentId || !isUuidString(documentId)) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Invalid documentId' })
      };
    }

    const row = await getAnalysisResultForViewer(documentId, userId);
    if (!row) {
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Document or analysis not found' })
      };
    }

    if (row.analysis_status !== 'COMPLETE' || !row.summary?.trim()) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'Analysis not complete',
          preview: null,
          totalChars: null,
          phiDetected: row.phi_detected,
          entitiesRedacted: row.entity_count
        })
      };
    }

    const raw = row.redacted_document_text;
    if (!raw?.trim()) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          preview: null,
          totalChars: null,
          truncated: false,
          phiDetected: row.phi_detected,
          entitiesRedacted: row.entity_count,
          message:
            'De-identified source text is not stored for this analysis. Run a new analysis (or re-analyze) after the latest deployment so the pipeline can save it.'
        })
      };
    }

    const totalChars = raw.length;
    const truncated = totalChars > MAX_PREVIEW_CHARS;
    const preview = truncated ? raw.slice(0, MAX_PREVIEW_CHARS) : raw;

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        preview,
        totalChars,
        truncated,
        phiDetected: row.phi_detected,
        entitiesRedacted: row.entity_count
      })
    };
  } catch (error) {
    console.error('getRedactedPreview error:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Failed to load preview' })
    };
  }
};
