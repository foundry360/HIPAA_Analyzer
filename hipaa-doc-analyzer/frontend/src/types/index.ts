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

/** Row from GET /saved-summaries */
export interface SavedSummaryItem {
  id: string;
  document_id: string;
  file_name: string;
  analysis_type: string;
  summary: string;
  phi_detected: boolean;
  entities_redacted: number;
  model_used: string | null;
  saved_at: string;
}

/** Analysis shared with the current user (from GET /saved-summaries `sharedWithMe`) */
export interface SharedWithMeItem {
  share_id: string;
  document_id: string;
  file_name: string;
  analysis_type: string;
  summary: string;
  phi_detected: boolean;
  entities_redacted: number;
  model_used: string | null;
  shared_at: string;
}
