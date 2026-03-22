import { useCallback, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { fetchRedactedPreview } from '../../api/redactedPreview';

type Props = {
  documentId: string;
};

/**
 * Expandable panel showing stored de-identified source text ([TYPE_n] tokens) for demos and trust.
 */
export function DeIdentifiedSourcePreview({ documentId }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [meta, setMeta] = useState<{
    totalChars: number | null;
    truncated: boolean;
    phiDetected?: boolean;
    entitiesRedacted?: number;
    message?: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetchRedactedPreview(documentId);
      setText(r.preview);
      setMeta({
        totalChars: r.totalChars ?? null,
        truncated: Boolean(r.truncated),
        phiDetected: r.phiDetected,
        entitiesRedacted: r.entitiesRedacted,
        message: r.message
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load preview');
      setText(null);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && text === null && !loading) void load();
  };

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/80">
      <button
        type="button"
        onClick={() => {
          toggle();
        }}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium text-slate-800 transition-colors hover:bg-slate-100/80"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
          )}
          De-identified source (tokenization preview)
        </span>
        <span className="text-xs font-normal text-slate-500">For review &amp; demos</span>
      </button>
      {open && (
        <div className="border-t border-slate-200 px-3 pb-3 pt-1">
          <p className="mb-2 text-xs leading-relaxed text-slate-600">
            Text below is what the pipeline stored after PHI detection: placeholders like{' '}
            <code className="rounded bg-white px-1 py-0.5 text-[11px] text-slate-800">[NAME_1]</code>,{' '}
            <code className="rounded bg-white px-1 py-0.5 text-[11px] text-slate-800">[DATE_1]</code>, etc.
            Actual types depend on Amazon Comprehend Medical.
          </p>
          {loading && (
            <div className="flex items-center gap-2 py-6 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading…
            </div>
          )}
          {err && <p className="text-sm text-red-700">{err}</p>}
          {!loading && !err && meta?.message && !text && (
            <p className="text-sm text-amber-800">{meta.message}</p>
          )}
          {!loading && !err && text && (
            <>
              <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
                {meta?.totalChars != null && <span>{meta.totalChars.toLocaleString()} characters</span>}
                {meta?.truncated && <span className="text-amber-800">Preview truncated for display</span>}
                {meta?.phiDetected && meta.entitiesRedacted != null && (
                  <span>
                    {meta.entitiesRedacted} PHI span(s) replaced before summarization
                  </span>
                )}
              </div>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md border border-slate-200 bg-white p-3 font-mono text-xs leading-relaxed text-slate-800">
                {text}
              </pre>
            </>
          )}
          {!loading && !err && text === '' && (
            <p className="text-sm text-slate-600">Empty de-identified text.</p>
          )}
        </div>
      )}
    </div>
  );
}
