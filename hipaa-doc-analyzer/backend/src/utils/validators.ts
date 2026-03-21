import { AnalysisType } from '../types';

const ANALYSIS_TYPES: AnalysisType[] = [
  'GENERAL_SUMMARY',
  'MEDICATIONS',
  'DIAGNOSES',
  'FOLLOW_UP_ACTIONS',
  'CHIEF_COMPLAINT'
];

export function isValidAnalysisType(value: unknown): value is AnalysisType {
  return typeof value === 'string' && ANALYSIS_TYPES.includes(value as AnalysisType);
}

export const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png'
] as const;

export function isAllowedFileType(value: unknown): value is string {
  return typeof value === 'string' && ALLOWED_FILE_TYPES.includes(value as typeof ALLOWED_FILE_TYPES[number]);
}

export function hasRequiredUploadUrlFields(obj: {
  fileName?: unknown;
  fileType?: unknown;
  analysisType?: unknown;
}): boolean {
  return (
    typeof obj.fileName === 'string' &&
    obj.fileName.length > 0 &&
    typeof obj.fileType === 'string' &&
    typeof obj.analysisType === 'string'
  );
}

export function hasRequiredAnalyzeFields(obj: {
  documentId?: unknown;
  s3Key?: unknown;
  analysisType?: unknown;
}): boolean {
  return (
    typeof obj.documentId === 'string' &&
    obj.documentId.length > 0 &&
    typeof obj.s3Key === 'string' &&
    obj.s3Key.length > 0 &&
    typeof obj.analysisType === 'string'
  );
}
