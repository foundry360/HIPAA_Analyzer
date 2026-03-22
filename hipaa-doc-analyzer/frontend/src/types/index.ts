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
  /** Outgoing shares (document_shares as owner). Omitted/0 if not loaded. */
  share_count?: number;
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

/** Unified row for saved + shared history (History page, global search). */
export type HistoryTableRow =
  | { kind: 'saved'; data: SavedSummaryItem }
  | { kind: 'shared'; data: SharedWithMeItem };

/** Passed via `navigate('/', { state: { splitFromHistory } })` to open Create Summary split view. */
export interface SplitFromHistoryState {
  documentId: string;
  fileName: string;
  summary: string;
  analysisType: string;
  phiDetected: boolean;
  entitiesRedacted: number;
  modelUsed: string;
}
