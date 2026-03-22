import { useState, useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { Loader2 } from 'lucide-react';
import { getDocumentViewUrl } from '../../api/documentViewUrl';
import { useDocumentUpload } from '../../hooks/useDocumentUpload';
import { AnalysisTypeSelector } from './AnalysisTypeSelector';
import { ClinicalSummaryMarkdown } from './ClinicalSummaryMarkdown';
import { PdfDocumentViewer } from './PdfDocumentViewer';
import { SummaryCardActions } from './SummaryCardActions';
import type { AnalysisType, SplitFromHistoryState } from '../../types';

const ANALYSIS_TYPES: AnalysisType[] = [
  'GENERAL_SUMMARY',
  'MEDICATIONS',
  'DIAGNOSES',
  'FOLLOW_UP_ACTIONS',
  'CHIEF_COMPLAINT'
];

function toAnalysisType(value: string): AnalysisType {
  return ANALYSIS_TYPES.includes(value as AnalysisType) ? (value as AnalysisType) : 'GENERAL_SUMMARY';
}

export function DocumentUploader() {
  const location = useLocation();
  const navigate = useNavigate();
  const incomingSplit = (location.state as { splitFromHistory?: SplitFromHistoryState } | null)
    ?.splitFromHistory;
  const [analysisType, setAnalysisType] = useState<AnalysisType>('GENERAL_SUMMARY');
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [remoteDocUrl, setRemoteDocUrl] = useState<string | null>(null);
  const [remoteFileName, setRemoteFileName] = useState<string | null>(null);
  const [historySplitLoading, setHistorySplitLoading] = useState(() => Boolean(incomingSplit));
  const [historySplitError, setHistorySplitError] = useState<string | null>(null);
  const { upload, reanalyze, isUploading, isAnalyzing, result, error, applySavedSummary } =
    useDocumentUpload();

  useEffect(() => {
    if (!previewFile) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      return;
    }
    setRemoteDocUrl(null);
    setRemoteFileName(null);
    const url = URL.createObjectURL(previewFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [previewFile]);

  useEffect(() => {
    const raw = location.state as { splitFromHistory?: SplitFromHistoryState } | null;
    const payload = raw?.splitFromHistory;
    if (!payload) return;

    let cancelled = false;
    setHistorySplitError(null);
    setHistorySplitLoading(true);

    void (async () => {
      try {
        const url = await getDocumentViewUrl(payload.documentId, payload.fileName);
        if (cancelled) return;
        const at = toAnalysisType(payload.analysisType);
        setAnalysisType(at);
        applySavedSummary({
          documentId: payload.documentId,
          summary: payload.summary,
          phiDetected: payload.phiDetected,
          entitiesRedacted: payload.entitiesRedacted,
          analysisType: at,
          modelUsed: payload.modelUsed || 'unknown',
          status: 'COMPLETE'
        });
        setRemoteDocUrl(url);
        setRemoteFileName(payload.fileName);
        navigate(location.pathname, { replace: true, state: {} });
      } catch (e) {
        if (!cancelled) {
          setHistorySplitError(e instanceof Error ? e.message : 'Could not open document');
          navigate(location.pathname, { replace: true, state: {} });
        }
      } finally {
        if (!cancelled) setHistorySplitLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [location.state, location.pathname, navigate, applySavedSummary]);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;
      const file = acceptedFiles[0]!;
      setRemoteDocUrl(null);
      setRemoteFileName(null);
      setPreviewFile(file);
      await upload(file, analysisType);
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

  const docDisplayUrl = previewUrl ?? remoteDocUrl;
  const showSplit = previewFile !== null || remoteDocUrl !== null;
  const documentFileName = previewFile?.name ?? remoteFileName ?? 'Document';
  const isImage = previewFile
    ? previewFile.type.startsWith('image/')
    : /\.(jpe?g|png)$/i.test(documentFileName);
  const isPdf = previewFile ? previewFile.type === 'application/pdf' : /\.pdf$/i.test(documentFileName);

  const dropzoneClass = `border-2 border-dashed rounded-xl text-center cursor-pointer transition-colors ${
    isDragActive
      ? 'border-blue-400 bg-blue-50'
      : 'border-slate-300 hover:border-blue-300 hover:bg-slate-50'
  } ${isUploading || isAnalyzing ? 'opacity-50 cursor-not-allowed' : ''}`;

  const summaryCard = result && (
    <div className="mt-4 flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-slate-800">Clinical Summary</h3>
        <div className="flex shrink-0 items-center gap-2">
          <SummaryCardActions
            result={result}
            fileName={documentFileName}
            onReanalyze={() => reanalyze(analysisType)}
            reanalyzeBusy={isAnalyzing}
          />
          {result.phiDetected && (
            <span className="shrink-0 rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-600">
              {result.entitiesRedacted} PHI entities redacted
            </span>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <ClinicalSummaryMarkdown>{result.summary}</ClinicalSummaryMarkdown>
      </div>
    </div>
  );

  const leftColumnControls = (
    <>
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">Summary &amp; controls</p>
      <AnalysisTypeSelector value={analysisType} onChange={setAnalysisType} />

      <div {...getRootProps()} className={`mt-4 ${dropzoneClass} p-6`}>
        <input {...getInputProps()} />
        <div className="text-sm text-slate-500">
          {isDragActive ? (
            <p>Drop another document here…</p>
          ) : (
            <>
              <p className="font-medium text-slate-700">Replace or add another file</p>
              <p className="mt-1 text-xs">PDF, JPG, PNG up to 10MB</p>
            </>
          )}
        </div>
      </div>

      {(isUploading || isAnalyzing) && (
        <div className="mt-4 flex items-center gap-3 rounded-lg bg-blue-50 p-4">
          <div className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
          <span className="text-sm font-medium text-blue-600">
            {isUploading ? 'Uploading document securely…' : 'Redacting PHI and generating summary…'}
          </span>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
    </>
  );

  if (historySplitLoading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-slate-600">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" strokeWidth={2} aria-hidden />
        <p className="text-sm font-medium">Opening document…</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {historySplitError && (
        <div className="shrink-0 border-b border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-800">
          {historySplitError}
        </div>
      )}
      {!showSplit ? (
        <div
          className={`flex min-h-0 flex-1 flex-col px-4 py-6 sm:px-8 sm:py-8 ${
            result ? 'overflow-hidden' : 'overflow-y-auto'
          }`}
        >
          <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col items-center py-2">
            <h2 className="mb-1 shrink-0 text-center text-2xl font-semibold text-slate-800">
              Summarize a Clinical Document
            </h2>
            <p className="mb-6 max-w-2xl shrink-0 text-center text-sm text-slate-500">
              Choose an analysis type, upload your clinical document, then review the clinical summary.
            </p>

            <div className="w-full shrink-0">
              <AnalysisTypeSelector value={analysisType} onChange={setAnalysisType} />
            </div>

            <div
              {...getRootProps()}
              className={`mt-5 w-full shrink-0 ${dropzoneClass} flex flex-col items-center justify-center px-8 py-10 sm:px-12`}
            >
              <input {...getInputProps()} />
              <div className="text-center text-slate-500">
                {isDragActive ? (
                  <p className="text-base font-medium text-blue-600">Drop the document here…</p>
                ) : (
                  <>
                    <p className="text-base font-medium text-slate-700 sm:text-lg">Drop a clinical document here</p>
                    <p className="mt-1.5 text-sm text-slate-500">or click to browse — PDF, JPG, PNG up to 10MB</p>
                  </>
                )}
              </div>
            </div>

            <p className="mt-4 max-w-2xl shrink-0 text-center text-xs text-slate-500">
              PHI is automatically redacted before AI processing. All activity is audit-logged.
            </p>

            {(isUploading || isAnalyzing) && (
              <div className="mt-6 flex shrink-0 items-center justify-center gap-3 rounded-lg bg-blue-50 p-4">
                <div className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
                <span className="text-sm font-medium text-blue-600">
                  {isUploading ? 'Uploading document securely…' : 'Redacting PHI and generating summary…'}
                </span>
              </div>
            )}

            {error && (
              <div className="mt-6 shrink-0 rounded-lg border border-red-200 bg-red-50 p-4">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {result && (
              <div className="mt-8 flex min-h-0 w-full min-w-0 flex-1 flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-slate-800">Clinical Summary</h3>
                  <div className="flex shrink-0 items-center gap-2">
                    <SummaryCardActions
                      result={result}
                      fileName={documentFileName}
                      onReanalyze={() => reanalyze(analysisType)}
                      reanalyzeBusy={isAnalyzing}
                    />
                    {result.phiDetected && (
                      <span className="shrink-0 rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-600">
                        {result.entitiesRedacted} PHI entities redacted
                      </span>
                    )}
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
                  <ClinicalSummaryMarkdown>{result.summary}</ClinicalSummaryMarkdown>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
          {/* 50% — controls fixed; only summary card scrolls */}
          <div className="flex min-h-0 w-1/2 min-w-0 flex-col overflow-hidden border-r border-slate-100 bg-white">
            <div
              className={`flex min-h-0 flex-1 flex-col px-5 py-5 ${
                result ? 'overflow-hidden' : 'overflow-y-auto'
              }`}
            >
              {result ? (
                <>
                  <div className="shrink-0">{leftColumnControls}</div>
                  {summaryCard}
                </>
              ) : (
                leftColumnControls
              )}
            </div>
          </div>
          {/* 50% — document (scrolls independently) */}
          <div className="flex min-h-0 w-1/2 min-w-0 flex-col overflow-hidden bg-white px-6 pb-6 pt-4 [color-scheme:light]">
            <h3 className="mb-4 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Document
            </h3>
            {docDisplayUrl && (
              <div
                className={`mt-2 flex min-h-0 flex-1 flex-col justify-center overflow-hidden bg-white ${
                  isPdf ? 'px-2 pb-2 pt-0 sm:px-4 sm:pb-3 sm:pt-0' : 'p-2 sm:p-4'
                }`}
              >
                <div className="flex h-full min-h-0 w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  {isImage && (
                    <div className="min-h-0 flex-1 overflow-auto">
                      <img
                        src={docDisplayUrl}
                        alt="Uploaded document"
                        className="h-full w-full bg-white object-contain object-top p-3 sm:p-6"
                      />
                    </div>
                  )}
                  {isPdf && (
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                      <PdfDocumentViewer fileUrl={docDisplayUrl} />
                    </div>
                  )}
                  {!isImage && !isPdf && (
                    <div className="p-6 text-center text-sm text-slate-500">
                      Preview is only available for PDF and image files. Use{' '}
                      <a
                        href={docDisplayUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-blue-600 hover:underline"
                      >
                        open in new tab
                      </a>
                      .
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
