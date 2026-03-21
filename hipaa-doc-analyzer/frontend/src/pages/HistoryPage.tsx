import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import { getDocumentViewUrl } from '../api/documentViewUrl';
import { fetchSavedSummaries } from '../api/savedSummaries';
import { ClinicalSummaryMarkdown } from '../components/Upload/ClinicalSummaryMarkdown';
import { ANALYSIS_TYPE_LABELS } from '../components/Upload/AnalysisTypeSelector';
import type { AnalysisType, SavedSummaryItem, SharedWithMeItem } from '../types';

type HistoryTableRow =
  | { kind: 'saved'; data: SavedSummaryItem }
  | { kind: 'shared'; data: SharedWithMeItem };

function analysisTypeLabel(t: string): string {
  return ANALYSIS_TYPE_LABELS[t as AnalysisType] ?? t;
}

const PAGE_SIZES = [25, 50, 75, 100] as const;

function formatSavedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  } catch {
    return iso;
  }
}

export function HistoryPage() {
  const [items, setItems] = useState<SavedSummaryItem[]>([]);
  const [sharedWithMe, setSharedWithMe] = useState<SharedWithMeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<HistoryTableRow | null>(null);
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [openingDocId, setOpeningDocId] = useState<string | null>(null);
  const [docOpenError, setDocOpenError] = useState<string | null>(null);

  const mergedRows = useMemo((): HistoryTableRow[] => {
    const saved: HistoryTableRow[] = items.map((data) => ({ kind: 'saved', data }));
    const shared: HistoryTableRow[] = sharedWithMe.map((data) => ({ kind: 'shared', data }));
    return [...saved, ...shared].sort((a, b) => {
      const ta = new Date(
        a.kind === 'saved' ? a.data.saved_at : a.data.shared_at
      ).getTime();
      const tb = new Date(
        b.kind === 'saved' ? b.data.saved_at : b.data.shared_at
      ).getTime();
      return tb - ta;
    });
  }, [items, sharedWithMe]);

  const handleOpenDocument = useCallback(async (row: HistoryTableRow) => {
    setDocOpenError(null);
    const key = row.kind === 'saved' ? row.data.id : row.data.share_id;
    setOpeningDocId(key);
    try {
      const url = await getDocumentViewUrl(row.data.document_id, row.data.file_name);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setDocOpenError(e instanceof Error ? e.message : 'Could not open document');
    } finally {
      setOpeningDocId(null);
    }
  }, []);

  const { paginatedItems, totalPages, startIdx, endIdx, effectivePage } = useMemo(() => {
    const total = mergedRows.length;
    const pages = Math.ceil(total / pageSize) || 1;
    const page = Math.min(Math.max(1, currentPage), pages);
    const start = (page - 1) * pageSize;
    const end = Math.min(start + pageSize, total);
    return {
      paginatedItems: mergedRows.slice(start, end),
      totalPages: pages,
      startIdx: total > 0 ? start + 1 : 0,
      endIdx: end,
      effectivePage: page
    };
  }, [mergedRows, pageSize, currentPage]);

  useEffect(() => {
    setCurrentPage((p) => Math.min(p, totalPages || 1));
  }, [totalPages]);

  const handlePageSizeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = Number(e.target.value);
    setPageSize(v);
    setCurrentPage(1);
  }, []);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const { items: saved, sharedWithMe: shared } = await fetchSavedSummaries();
      setItems(saved);
      setSharedWithMe(shared);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load history');
      setItems([]);
      setSharedWithMe([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-screen-2xl flex-1 flex-col overflow-hidden px-4 py-6 sm:px-8">
      <div className="shrink-0">
        <h2 className="text-2xl font-semibold text-slate-800">Analysis History</h2>
        <p className="mt-1 text-sm text-slate-500">
          Your saved summaries and analyses others shared with you (by email) appear here.
        </p>
        {docOpenError && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
            {docOpenError}
          </div>
        )}
      </div>

      <div className="mt-6 min-h-0 flex-1 overflow-auto">
        {loading && (
          <p className="text-sm text-slate-500">Loading…</p>
        )}
        {!loading && error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {!loading && !error && mergedRows.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
            No saved summaries yet. Run an analysis and choose <strong>Save</strong> or <strong>Share</strong>{' '}
            on the summary card.
          </div>
        )}
        {!loading && !error && mergedRows.length > 0 && (
          <>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Document</th>
                  <th className="px-4 py-3">Analysis type</th>
                  <th className="px-4 py-3">PHI</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {paginatedItems.map((row) => {
                  const rowKey =
                    row.kind === 'saved' ? row.data.id : `shared-${row.data.share_id}`;
                  const dateStr =
                    row.kind === 'saved' ? row.data.saved_at : row.data.shared_at;
                  const d = row.data;
                  return (
                  <tr
                    key={rowKey}
                    className="odd:bg-white even:bg-slate-50/80 hover:bg-slate-100/90"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      <div className="flex flex-col gap-0.5">
                        <span>{formatSavedAt(dateStr)}</span>
                        {row.kind === 'shared' && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-indigo-600">
                            Shared with you
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="max-w-xl min-w-[12rem] px-4 py-3">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="min-w-0 truncate font-medium text-slate-900" title={d.file_name}>
                          {d.file_name}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleOpenDocument(row)}
                          disabled={openingDocId === rowKey}
                          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                          title="Open original document in a new tab"
                        >
                          <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                          {openingDocId === rowKey ? 'Opening…' : 'Open'}
                        </button>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{analysisTypeLabel(d.analysis_type)}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {d.phi_detected ? (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                          {d.entities_redacted} redacted
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setDocOpenError(null);
                          setSelected(row);
                        }}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
                      >
                        Summary
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-4">
            <div className="flex items-center gap-4">
              <span className="text-sm text-slate-600">
                Showing {startIdx}–{endIdx} of {mergedRows.length}
              </span>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                Rows per page
                <select
                  value={pageSize}
                  onChange={handlePageSizeChange}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  aria-label="Rows per page"
                >
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={effectivePage <= 1}
                className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" strokeWidth={2} />
              </button>
              <span className="min-w-[7rem] px-3 py-2 text-center text-sm text-slate-600">
                Page {effectivePage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={effectivePage >= totalPages}
                className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
          </div>
        </>
        )}
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="summary-dialog-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            aria-label="Close"
            onClick={() => setSelected(null)}
          />
          <div className="relative max-h-[min(90vh,720px)] w-full max-w-2xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="min-w-0">
                <h3 id="summary-dialog-title" className="truncate font-semibold text-slate-900">
                  {selected.data.file_name}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {analysisTypeLabel(selected.data.analysis_type)} ·{' '}
                  {formatSavedAt(
                    selected.kind === 'saved'
                      ? selected.data.saved_at
                      : selected.data.shared_at
                  )}
                  {selected.kind === 'shared' && (
                    <span className="ml-1.5 text-indigo-600">· Shared with you</span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                aria-label="Close"
              >
                <X className="h-5 w-5" strokeWidth={2} />
              </button>
            </div>
            <div className="max-h-[min(70vh,560px)] overflow-y-auto px-5 py-4">
              <ClinicalSummaryMarkdown>{selected.data.summary}</ClinicalSummaryMarkdown>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
