import { APIGatewayProxyHandler } from 'aws-lambda';
import { getAnalysisResultForViewer } from '../services/auditLog';
import { AnalyzeResponse } from '../types';
import { CORS_HEADERS } from '../utils/cors';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const documentId = event.pathParameters?.documentId ?? event.queryStringParameters?.documentId;
    if (!documentId) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Missing documentId' })
      };
    }

    const row = await getAnalysisResultForViewer(documentId, userId);
    if (!row) {
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Analysis result not found' })
      };
    }

    if (row.analysis_status === 'PENDING' || row.analysis_status === 'PROCESSING') {
      const response: AnalyzeResponse = {
        documentId: row.document_id,
        summary: '',
        phiDetected: false,
        entitiesRedacted: 0,
        analysisType: row.analysis_type as AnalyzeResponse['analysisType'],
        modelUsed: '',
        status: row.analysis_status
      };
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify(response)
      };
    }

    if (row.analysis_status === 'FAILED') {
      const response: AnalyzeResponse = {
        documentId: row.document_id,
        summary: '',
        phiDetected: false,
        entitiesRedacted: 0,
        analysisType: row.analysis_type as AnalyzeResponse['analysisType'],
        modelUsed: '',
        status: 'FAILED',
        error: row.summary || 'Analysis failed'
      };
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify(response)
      };
    }

    const response: AnalyzeResponse = {
      documentId: row.document_id,
      summary: row.summary,
      phiDetected: row.phi_detected,
      entitiesRedacted: row.entity_count,
      analysisType: row.analysis_type as AnalyzeResponse['analysisType'],
      modelUsed: row.model_used ?? 'unknown',
      status: 'COMPLETE'
    };

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(response)
    };
  } catch (error) {
    const err = error as Error;
    console.error('getResult error:', err?.message ?? error);
    console.error('getResult stack:', err?.stack);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
