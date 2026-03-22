import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DeIdentifiedSourcePreview } from '../../components/Upload/DeIdentifiedSourcePreview';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Manual testing only. This route is registered only when import.meta.env.DEV is true.
 */
export default function RedactedPreviewTestPage() {
  const [params] = useSearchParams();
  const fromQuery = params.get('documentId')?.trim() ?? '';
  const [draft, setDraft] = useState(fromQuery);
  const [documentId, setDocumentId] = useState(() => (UUID_RE.test(fromQuery) ? fromQuery : ''));

  const draftValid = useMemo(() => UUID_RE.test(draft.trim()), [draft]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
      <h1 className="text-lg font-semibold text-slate-800">De-identified source preview (local dev)</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-600">
        Paste a document UUID from a completed analysis, then apply. Optional query:{' '}
        <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">?documentId=…</code>
      </p>

      <div className="mt-4 flex max-w-2xl flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm text-slate-800 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/30"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          onClick={() => setDocumentId(draftValid ? draft.trim() : '')}
          disabled={!draftValid}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Apply
        </button>
      </div>
      {!draftValid && draft.trim() !== '' && (
        <p className="mt-2 text-sm text-amber-800">Enter a valid UUID.</p>
      )}

      {documentId && (
        <div className="mt-6 max-w-4xl">
          <DeIdentifiedSourcePreview documentId={documentId} />
        </div>
      )}
    </div>
  );
}
