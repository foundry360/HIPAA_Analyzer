import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { extractTextFromS3 } from '../services/textract';
import { detectAndRedactPHI } from '../services/comprehend';
import { generateClinicalSummary } from '../services/bedrock';
import { storeTokenMap } from '../services/tokenMap';
import {
  writeAuditLog,
  createPendingAnalysis,
  getAnalysisResult,
  resetAnalysisToPending,
  setAnalysisProcessing,
  updateAnalysisComplete,
  updateAnalysisFailed,
  AnalysisResultRow
} from '../services/auditLog';
import {
  AnalyzeRequest,
  AnalyzeResponse,
  AnalyzeWorkerPayload,
  AnalysisType
} from '../types';
import { hasRequiredAnalyzeFields, isValidAnalysisType } from '../utils/validators';
import { CORS_HEADERS } from '../utils/cors';

const lambda = new LambdaClient({ region: process.env.AWS_REGION });

function isWorkerPayload(e: unknown): e is AnalyzeWorkerPayload {
  return (
    typeof e === 'object' &&
    e !== null &&
    (e as AnalyzeWorkerPayload).mode === 'worker' &&
    typeof (e as AnalyzeWorkerPayload).documentId === 'string'
  );
}

function rowToResponse(row: AnalysisResultRow): AnalyzeResponse {
  return {
    documentId: row.document_id,
    summary: row.summary,
    phiDetected: row.phi_detected,
    entitiesRedacted: row.entity_count,
    analysisType: row.analysis_type as AnalysisType,
    modelUsed: row.model_used ?? 'unknown',
    status: 'COMPLETE'
  };
}

async function invokeWorker(payload: AnalyzeWorkerPayload): Promise<void> {
  // Set automatically by Lambda; avoids CDK circular dependency from passing function name via env
  const name = process.env.AWS_LAMBDA_FUNCTION_NAME;
  if (!name) throw new Error('AWS_LAMBDA_FUNCTION_NAME is not set');

  await lambda.send(
    new InvokeCommand({
      FunctionName: name,
      InvocationType: 'Event',
      Payload: Buffer.from(JSON.stringify(payload), 'utf8')
    })
  );
}

/**
 * Long-running pipeline (Textract → Comprehend → Bedrock). Runs in async worker only —
 * API Gateway REST max integration timeout is 29s.
 */
async function runAnalysisPipeline(
  documentId: string,
  userId: string,
  body: AnalyzeRequest
): Promise<void> {
  const startTime = Date.now();

  await setAnalysisProcessing(documentId, userId);

  try {
    console.log(`[${documentId}] Extracting text via Textract`);
    const rawText = await extractTextFromS3(
      process.env.S3_BUCKET_NAME!,
      body.s3Key
    );

    const noTextFallback = 'No extractable text in document.';
    if (!rawText?.trim() || rawText.trim() === noTextFallback) {
      throw new Error(
        'Could not extract text from the document (timeout or unsupported format). Try a smaller or simpler PDF/image.'
      );
    }

    console.log(`[${documentId}] Running Comprehend Medical PHI detection`);
    const { redactedText, tokenMap, entities } =
      await detectAndRedactPHI(rawText);

    console.log(
      `[${documentId}] Detected ${entities.length} PHI entities, redacted`
    );

    if (entities.length > 0) {
      await storeTokenMap(documentId, tokenMap, entities.length);
    }

    if (!redactedText?.trim() || redactedText.trim().length < 20) {
      throw new Error(
        'No extractable text from this document. Use a PDF or image with selectable/readable text (not handwritten or image-only scans).'
      );
    }

    console.log(`[${documentId}] Sending sanitized text to Bedrock`);
    const summary = await generateClinicalSummary(
      redactedText,
      body.analysisType
    );

    const modelUsed =
      process.env.BEDROCK_MODEL_ID ||
      'anthropic.claude-3-5-sonnet-20241022-v2:0';

    await updateAnalysisComplete(
      documentId,
      userId,
      body.analysisType,
      summary,
      entities.length > 0,
      entities.length,
      modelUsed
    );

    await writeAuditLog({
      documentId,
      userId,
      action: 'DOCUMENT_ANALYSIS',
      phiEntitiesDetected: entities.length,
      phiTypesFound: [...new Set(entities.map(e => e.type))],
      modelUsed,
      analysisType: body.analysisType,
      status: 'SUCCESS',
      durationMs: Date.now() - startTime
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error(`[${documentId}] Pipeline error:`, err?.message ?? error);
    console.error(`[${documentId}] Stack:`, err?.stack);

    const safeMessage =
      'Analysis failed. Please try again or use a smaller document.';

    await updateAnalysisFailed(documentId, userId, safeMessage).catch(
      console.error
    );

    await writeAuditLog({
      documentId,
      userId,
      action: 'DOCUMENT_ANALYSIS',
      phiEntitiesDetected: 0,
      phiTypesFound: [],
      modelUsed: process.env.BEDROCK_MODEL_ID || 'unknown',
      analysisType: body.analysisType,
      status: 'ERROR',
      errorMessage: err.message,
      durationMs: Date.now() - startTime
    }).catch(console.error);
  }
}

async function handleWorker(payload: AnalyzeWorkerPayload): Promise<void> {
  const { documentId, userId, s3Key, analysisType } = payload;
  await runAnalysisPipeline(documentId, userId, {
    documentId,
    s3Key,
    analysisType
  });
}

async function handleApi(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const userId = event.requestContext.authorizer?.claims?.sub;
  if (!userId) {
    return {
      statusCode: 401,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Unauthorized' })
    };
  }

  let body: AnalyzeRequest;
  try {
    body = JSON.parse(event.body || '{}') as AnalyzeRequest;
  } catch {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Invalid JSON' })
    };
  }

  const { documentId, s3Key, analysisType } = body;

  if (!hasRequiredAnalyzeFields(body) || !isValidAnalysisType(analysisType)) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Missing required fields' })
    };
  }

  const existing = await getAnalysisResult(documentId, userId);

  if (existing) {
    if (existing.analysis_status === 'COMPLETE') {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify(rowToResponse(existing))
      };
    }
    if (
      existing.analysis_status === 'PENDING' ||
      existing.analysis_status === 'PROCESSING'
    ) {
      return {
        statusCode: 202,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          documentId,
          status: 'PENDING',
          message:
            'Analysis already in progress. Poll GET /result/{documentId}.'
        })
      };
    }
    if (existing.analysis_status === 'FAILED') {
      await resetAnalysisToPending(documentId, userId, analysisType);
      await invokeWorker({
        mode: 'worker',
        documentId,
        s3Key,
        analysisType,
        userId
      });
      return {
        statusCode: 202,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          documentId,
          status: 'PENDING',
          message: 'Analysis restarted. Poll GET /result/{documentId}.'
        })
      };
    }
  }

  try {
    await createPendingAnalysis(documentId, userId, analysisType);
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === '23505') {
      const row = await getAnalysisResult(documentId, userId);
      if (row?.analysis_status === 'COMPLETE') {
        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify(rowToResponse(row))
        };
      }
      return {
        statusCode: 202,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          documentId,
          status: 'PENDING',
          message:
            'Analysis already in progress. Poll GET /result/{documentId}.'
        })
      };
    }
    throw e;
  }

  await invokeWorker({
    mode: 'worker',
    documentId,
    s3Key,
    analysisType,
    userId
  });

  return {
    statusCode: 202,
    headers: CORS_HEADERS,
    body: JSON.stringify({
      documentId,
      status: 'PENDING',
      message: 'Analysis started. Poll GET /result/{documentId}.'
    })
  };
}

export const handler = async (
  event: APIGatewayProxyEvent | AnalyzeWorkerPayload
): Promise<APIGatewayProxyResult> => {
  if (isWorkerPayload(event)) {
    await handleWorker(event);
    return { statusCode: 200, headers: {}, body: '{}' };
  }
  return handleApi(event as APIGatewayProxyEvent);
};
