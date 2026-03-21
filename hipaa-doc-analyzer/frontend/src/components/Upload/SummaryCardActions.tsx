import { useState, useCallback, useEffect } from 'react';
import { Loader2, RefreshCw, Save, Share2 } from 'lucide-react';
import { saveSummaryToHistory } from '../../api/savedSummaries';
import { ShareSummaryDialog } from './ShareSummaryDialog';
import type { AnalyzeResponse } from '../../types';

export function SummaryCardActions({
  result,
  fileName,
  onReanalyze,
  reanalyzeBusy
}: {
  result: AnalyzeResponse;
  fileName: string;
  onReanalyze: () => void | Promise<void>;
  /** When true, refresh control shows a spinner and is non-interactive */
  reanalyzeBusy?: boolean;
}) {
  const [shareOpen, setShareOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setSaveStatus('idle');
    setSaveError(null);
  }, [result.documentId, result.analysisType, result.summary]);

  const onSave = useCallback(async () => {
    setSaveError(null);
    setSaveStatus('saving');
    try {
      await saveSummaryToHistory(result, fileName);
      setSaveStatus('saved');
    } catch (e) {
      setSaveStatus('error');
      setSaveError(e instanceof Error ? e.message : 'Save failed');
    }
  }, [result, fileName]);

  const saveTitle =
    saveStatus === 'saved'
      ? 'Saved to Summaries'
      : saveStatus === 'saving'
        ? 'Saving…'
        : saveStatus === 'error'
          ? saveError ?? 'Save failed — tap to retry'
          : 'Save summary to Summaries';

  const canShare =
    Boolean(result.summary) &&
    (result.status === undefined || result.status === 'COMPLETE');

  return (
    <div className="flex items-center gap-1.5">
      {canShare && (
        <>
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            title="Share with another user by email"
            aria-label="Share analysis with another user"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
          >
            <Share2 className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
          <ShareSummaryDialog
            open={shareOpen}
            onClose={() => setShareOpen(false)}
            documentId={result.documentId}
            fileName={fileName}
          />
        </>
      )}
      <button
        type="button"
        onClick={onSave}
        disabled={saveStatus === 'saving' || saveStatus === 'saved'}
        title={saveTitle}
        aria-label={saveTitle}
        className={[
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors',
          saveStatus === 'saved'
            ? 'border-blue-300 bg-blue-50/80 text-blue-600'
            : saveStatus === 'error'
              ? 'border-amber-400 bg-amber-50/80 text-amber-800 hover:bg-amber-100'
              : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700',
          saveStatus === 'saving' || saveStatus === 'saved' ? 'cursor-default' : ''
        ].join(' ')}
      >
        {saveStatus === 'saving' ? (
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} aria-hidden />
        ) : (
          <Save className="h-4 w-4" strokeWidth={2} aria-hidden />
        )}
      </button>

      <button
        type="button"
        onClick={() => void onReanalyze()}
        disabled={reanalyzeBusy}
        title="Re-run full analysis on this file: extract text, redact PHI, and call the model again for a new summary (uses the analysis type selected above—not a screen refresh)"
        aria-label="Re-run full analysis: new AI summary from the same document"
        className={[
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors',
          'hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700',
          reanalyzeBusy ? 'cursor-not-allowed opacity-90' : ''
        ].join(' ')}
      >
        {reanalyzeBusy ? (
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} aria-hidden />
        ) : (
          <RefreshCw className="h-4 w-4" strokeWidth={2} aria-hidden />
        )}
      </button>
    </div>
  );
}
