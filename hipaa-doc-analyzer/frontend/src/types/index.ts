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
  status?: AnalysisJobStatus;
  error?: string;
  message?: string;
}
