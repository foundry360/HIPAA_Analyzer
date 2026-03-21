export type AnalysisType =
  | 'GENERAL_SUMMARY'
  | 'MEDICATIONS'
  | 'DIAGNOSES'
  | 'FOLLOW_UP_ACTIONS'
  | 'CHIEF_COMPLAINT';

export interface UploadUrlRequest {
  fileName: string;
  fileType: string;
  analysisType: AnalysisType;
}

export interface UploadUrlResponse {
  uploadUrl: string;
  documentId: string;
  s3Key: string;
}

export interface AnalyzeRequest {
  documentId: string;
  s3Key: string;
  analysisType: AnalysisType;
}

export type AnalysisJobStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETE'
  | 'FAILED';

export interface AnalyzeResponse {
  documentId: string;
  summary: string;
  phiDetected: boolean;
  entitiesRedacted: number;
  analysisType: AnalysisType;
  modelUsed: string;
  /** Present when returned from GET /result while job is running or failed */
  status?: AnalysisJobStatus;
  error?: string;
}

/** Async worker invocation payload (not API Gateway) */
export interface AnalyzeWorkerPayload {
  mode: 'worker';
  documentId: string;
  s3Key: string;
  analysisType: AnalysisType;
  userId: string;
}

export interface PHIEntity {
  text: string;
  type: string;
  beginOffset: number;
  endOffset: number;
  score: number;
}

export interface TokenMap {
  [token: string]: {
    originalValue: string;
    type: string;
    confidence: number;
  };
}

export interface AuditEntry {
  documentId: string;
  userId: string;
  action: string;
  phiEntitiesDetected: number;
  phiTypesFound: string[];
  modelUsed: string;
  analysisType: string;
  status: 'SUCCESS' | 'ERROR';
  errorMessage?: string;
  durationMs: number;
}
