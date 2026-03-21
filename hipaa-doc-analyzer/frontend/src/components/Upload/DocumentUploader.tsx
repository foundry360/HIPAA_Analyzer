import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useDocumentUpload } from '../../hooks/useDocumentUpload';
import { AnalysisTypeSelector } from './AnalysisTypeSelector';
import type { AnalysisType } from '../../types';

export function DocumentUploader() {
  const [analysisType, setAnalysisType] = useState<AnalysisType>('GENERAL_SUMMARY');
  const { upload, isUploading, isAnalyzing, result, error } = useDocumentUpload();

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;
      await upload(acceptedFiles[0]!, analysisType);
    },
    [analysisType, upload]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png']
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    disabled: isUploading || isAnalyzing
  });

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h2 className="text-2xl font-semibold text-slate-800 mb-2">Analyze a document</h2>
      <p className="text-sm text-slate-500 mb-6">
        PHI is automatically redacted before AI processing. All activity is audit-logged.
      </p>

      <AnalysisTypeSelector value={analysisType} onChange={setAnalysisType} />

      <div
        {...getRootProps()}
        className={`mt-4 border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
          isDragActive
            ? 'border-emerald-500 bg-emerald-50'
            : 'border-slate-300 hover:border-emerald-400 hover:bg-slate-50'
        } ${(isUploading || isAnalyzing) ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <input {...getInputProps()} />
        <div className="text-slate-500">
          {isDragActive ? (
            <p>Drop the document here…</p>
          ) : (
            <>
              <p className="font-medium text-slate-700">Drop a clinical document here</p>
              <p className="text-sm mt-1">or click to browse — PDF, JPG, PNG up to 10MB</p>
            </>
          )}
        </div>
      </div>

      {(isUploading || isAnalyzing) && (
        <div className="mt-4 p-4 bg-emerald-50 rounded-lg flex items-center gap-3">
          <div className="animate-spin h-5 w-5 border-2 border-emerald-500 border-t-transparent rounded-full" />
          <span className="text-sm text-emerald-700 font-medium">
            {isUploading ? 'Uploading document securely…' : 'Redacting PHI and generating summary…'}
          </span>
        </div>
      )}

      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {result && (
        <div className="mt-6 p-5 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-slate-800">Clinical summary</h3>
            {result.phiDetected && (
              <span className="text-xs px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full font-medium">
                {result.entitiesRedacted} PHI entities redacted
              </span>
            )}
          </div>
          <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed max-w-none">
            {result.summary}
          </div>
        </div>
      )}
    </div>
  );
}
