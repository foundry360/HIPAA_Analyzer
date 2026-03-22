import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Waypoints,
  X
} from 'lucide-react';
import {
  deleteSavedSummary,
  fetchSavedSummaries,
  renameSavedSummary
} from '../api/savedSummaries';
import { HistoryRowActions } from '../components/History/HistoryRowActions';
import { ClinicalSummaryMarkdown } from '../components/Upload/ClinicalSummaryMarkdown';
import { ShareSummaryDialog } from '../components/Upload/ShareSummaryDialog';
import { ANALYSIS_TYPE_LABELS } from '../components/Upload/AnalysisTypeSelector';
import type {
  AnalysisType,
  HistoryTableRow,
  SavedSummaryItem,
  SharedWithMeItem,
  SplitFromHistoryState
} from '../types';
import { downloadSummaryPdf } from '../utils/downloadSummaryPdf';
import {
  mergeHistoryRows,
  parseOpenKey,
  sharedUserIconTitle,
  showSharedUserIcon
} from '../utils/historyRows';

function analysisTypeLabel(t: string): string {
  return ANALYSIS_TYPE_LABELS[t as AnalysisType] ?? t;
}

const PAGE_SIZES = [25, 50, 75, 100] as const;

type SummaryFilterTab = 'all' | 'mine' | 'shared-with-me';

const SUMMARY_FILTER_TABS: { id: SummaryFilterTab; label: string }[] = [
  { id: 'all', label: 'All Summaries' },
  { id: 'mine', label: 'My Summaries' },
  { id: 'shared-with-me', label: 'Shared With Me' }
];

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

function rowToSplitState(row: HistoryTableRow): SplitFromHistoryState {
  const d = row.data;
  return {
    documentId: d.document_id,
    fileName: d.file_name,
    summary: d.summary,
    analysisType: d.analysis_type,
    phiDetected: d.phi_detected,
    entitiesRedacted: d.entities_redacted,
    modelUsed: d.model_used ?? 'unknown'
  };
}

type SummarySortColumn = 'date' | 'document' | 'analysis' | 'phi';

function rowTimestamp(row: HistoryTableRow): number {
  const iso = row.kind === 'saved' ? row.data.saved_at : row.data.shared_at;
  return new Date(iso).getTime();
}

/** -1 when no PHI so “no PHI” sorts before any positive count when ascending */
function phiSortValue(row: HistoryTableRow): number {
  return row.data.phi_detected ? row.data.entities_redacted : -1;
}

function compareSummaryRows(
  a: HistoryTableRow,
  b: HistoryTableRow,
  col: SummarySortColumn,
  dir: 'asc' | 'desc'
): number {
  const flip = dir === 'desc' ? -1 : 1;
  let cmp = 0;
  switch (col) {
    case 'date':
      cmp = rowTimestamp(a) - rowTimestamp(b);
      break;
    case 'document':
      cmp = a.data.file_name.localeCompare(b.data.file_name, undefined, { sensitivity: 'base' });
      break;
    case 'analysis':
      cmp = a.data.analysis_type.localeCompare(b.data.analysis_type);
      break;
    case 'phi':
      cmp = phiSortValue(a) - phiSortValue(b);
      break;
    default:
      return 0;
  }
  return flip * cmp;
}

function SummarySortTh({
  column,
  label,
  sortColumn,
  sortDir,
  onSort,
  className
}: {
  column: SummarySortColumn;
  label: string;
  sortColumn: SummarySortColumn;
  sortDir: 'asc' | 'desc';
  onSort: (c: SummarySortColumn) => void;
  className?: string;
}) {
  const active = sortColumn === column;
  const ariaSort = active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none';
  return (
    <th scope="col" className={className ?? 'px-4 py-3'} aria-sort={ariaSort}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className="inline-flex w-full min-w-0 items-center justify-start gap-1.5 rounded px-0 py-0 text-left font-semibold uppercase tracking-wide text-slate-500 transition-colors hover:bg-slate-100/80 hover:text-slate-800 focus-visible:outline focus-visible:ring-2 focus-visible:ring-blue-400"
      >
        <span className="truncate">{label}</span>
        {active ? (
          sortDir === 'asc' ? (
            <ArrowUp className="h-3.5 w-3.5 shrink-0 text-slate-600" aria-hidden />
          ) : (
            <ArrowDown className="h-3.5 w-3.5 shrink-0 text-slate-600" aria-hidden />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
        )}
      </button>
    </th>
  );
}

export function HistoryPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<SavedSummaryItem[]>([]);
  const [sharedWithMe, setSharedWithMe] = useState<SharedWithMeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<HistoryTableRow | null>(null);
  const [pdfDownloadBusy, setPdfDownloadBusy] = useState(false);
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [actionsMenuKey, setActionsMenuKey] = useState<string | null>(null);
  const [renameRow, setRenameRow] = useState<HistoryTableRow | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleteRow, setDeleteRow] = useState<HistoryTableRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [shareRow, setShareRow] = useState<HistoryTableRow | null>(null);
  const [filterTab, setFilterTab] = useState<SummaryFilterTab>('all');
  const [sortColumn, setSortColumn] = useState<SummarySortColumn>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const mergedRows = useMemo(
    (): HistoryTableRow[] => mergeHistoryRows(items, sharedWithMe),
    [items, sharedWithMe]
  );

  const filteredRows = useMemo((): HistoryTableRow[] => {
    if (filterTab === 'all') return mergedRows;
    if (filterTab === 'mine') return mergedRows.filter((r) => r.kind === 'saved');
    return mergedRows.filter((r) => r.kind === 'shared');
  }, [mergedRows, filterTab]);

  const sortedFilteredRows = useMemo(() => {
    const rows = [...filteredRows];
    rows.sort((a, b) => compareSummaryRows(a, b, sortColumn, sortDir));
    return rows;
  }, [filteredRows, sortColumn, sortDir]);

  const handleSortClick = useCallback((col: SummarySortColumn) => {
    setCurrentPage(1);
    if (sortColumn === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(col);
      setSortDir(col === 'date' || col === 'phi' ? 'desc' : 'asc');
    }
  }, [sortColumn]);

  const openDocumentInSplitView = useCallback(
    (row: HistoryTableRow) => {
      navigate('/', { state: { splitFromHistory: rowToSplitState(row) } });
    },
    [navigate]
  );

  const { paginatedItems, totalPages, startIdx, endIdx, effectivePage } = useMemo(() => {
    const total = sortedFilteredRows.length;
    const pages = Math.ceil(total / pageSize) || 1;
    const page = Math.min(Math.max(1, currentPage), pages);
    const start = (page - 1) * pageSize;
    const end = Math.min(start + pageSize, total);
    return {
      paginatedItems: sortedFilteredRows.slice(start, end),
      totalPages: pages,
      startIdx: total > 0 ? start + 1 : 0,
      endIdx: end,
      effectivePage: page
    };
  }, [sortedFilteredRows, pageSize, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterTab]);

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
      setError(e instanceof Error ? e.message : 'Failed to load summaries');
      setItems([]);
      setSharedWithMe([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openParam = searchParams.get('open');

  useEffect(() => {
    if (!openParam || mergedRows.length === 0) return;
    let decoded = openParam;
    try {
      decoded = decodeURIComponent(openParam);
    } catch {
      /* use openParam */
    }
    const parsed = parseOpenKey(decoded);
    if (!parsed) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('open');
          return next;
        },
        { replace: true }
      );
      return;
    }
    const row = mergedRows.find((r) =>
      parsed.kind === 'saved'
        ? r.kind === 'saved' && r.data.id === parsed.id
        : r.kind === 'shared' && r.data.share_id === parsed.id
    );
    if (row) {
      setSelected(row);
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('open');
        return next;
      },
      { replace: true }
    );
  }, [openParam, mergedRows, setSearchParams]);

  const applyRenamedFile = useCallback((documentId: string, fileName: string) => {
    setItems((prev) =>
      prev.map((it) => (it.document_id === documentId ? { ...it, file_name: fileName } : it))
    );
    setSelected((prev) =>
      prev && prev.kind === 'saved' && prev.data.document_id === documentId
        ? { ...prev, data: { ...prev.data, file_name: fileName } }
        : prev
    );
  }, []);

  const removeSavedFromList = useCallback((documentId: string) => {
    setItems((prev) => prev.filter((it) => it.document_id !== documentId));
    setSelected((prev) =>
      prev && prev.kind === 'saved' && prev.data.document_id === documentId ? null : prev
    );
  }, []);

  const submitRename = useCallback(async () => {
    if (!renameRow || renameRow.kind !== 'saved') return;
    const name = renameValue.trim();
    if (!name) {
      setRenameError('Enter a document name');
      return;
    }
    setRenameError(null);
    setRenameBusy(true);
    try {
      await renameSavedSummary(renameRow.data.document_id, name);
      applyRenamedFile(renameRow.data.document_id, name);
      setRenameRow(null);
    } catch (e) {
      setRenameError(e instanceof Error ? e.message : 'Rename failed');
    } finally {
      setRenameBusy(false);
    }
  }, [renameRow, renameValue, applyRenamedFile]);

  const confirmDelete = useCallback(async () => {
    if (!deleteRow || deleteRow.kind !== 'saved') return;
    setDeleteError(null);
    setDeleteBusy(true);
    try {
      await deleteSavedSummary(deleteRow.data.document_id);
      removeSavedFromList(deleteRow.data.document_id);
      setDeleteRow(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteRow, removeSavedFromList]);

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-screen-2xl flex-1 flex-col overflow-hidden px-4 py-6 sm:px-8">
      <div className="shrink-0">
        <h2 className="text-2xl font-semibold text-slate-800">Summaries</h2>
        <p className="mt-1 text-sm text-slate-500">
          Your saved summaries and analyses others shared with you appear here.
        </p>
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
          <nav
            className="mb-4 flex flex-wrap gap-6 sm:gap-10"
            aria-label="Filter summaries"
          >
            {SUMMARY_FILTER_TABS.map(({ id, label }) => {
              const selected = filterTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setFilterTab(id)}
                  className={[
                    '-mb-px border-b-[3px] border-solid pb-2 text-sm font-medium transition-colors',
                    selected
                      ? 'border-b-blue-500 text-slate-900'
                      : 'border-b-transparent text-slate-500 hover:text-slate-800'
                  ].join(' ')}
                >
                  {label}
                </button>
              );
            })}
          </nav>

          {filteredRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
              No summaries in this view.
            </div>
          ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <SummarySortTh
                    column="date"
                    label="Date"
                    sortColumn={sortColumn}
                    sortDir={sortDir}
                    onSort={handleSortClick}
                  />
                  <SummarySortTh
                    column="document"
                    label="Document"
                    sortColumn={sortColumn}
                    sortDir={sortDir}
                    onSort={handleSortClick}
                  />
                  <SummarySortTh
                    column="analysis"
                    label="Analysis type"
                    sortColumn={sortColumn}
                    sortDir={sortDir}
                    onSort={handleSortClick}
                  />
                  <SummarySortTh
                    column="phi"
                    label="PHI"
                    sortColumn={sortColumn}
                    sortDir={sortDir}
                    onSort={handleSortClick}
                  />
                  <th scope="col" className="px-4 py-3 text-right">Actions</th>
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
                      {formatSavedAt(dateStr)}
                    </td>
                    <td className="max-w-xl min-w-[12rem] px-4 py-3">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="min-w-0 truncate font-medium text-slate-900" title={d.file_name}>
                            {d.file_name}
                          </span>
                          {showSharedUserIcon(row) &&
                            (row.kind === 'saved' ? (
                              <button
                                type="button"
                                className="inline-flex shrink-0 rounded p-0.5 text-blue-500 transition-colors hover:bg-blue-50 focus-visible:outline focus-visible:ring-2 focus-visible:ring-blue-400"
                                title={`${sharedUserIconTitle(row)} — click to manage sharing`}
                                aria-label="Manage sharing"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShareRow(row);
                                }}
                              >
                                <Waypoints className="h-4 w-4" strokeWidth={2} aria-hidden />
                              </button>
                            ) : (
                              <span
                                className="inline-flex shrink-0 text-blue-500"
                                title={sharedUserIconTitle(row)}
                                aria-label={sharedUserIconTitle(row)}
                              >
                                <Waypoints className="h-4 w-4" strokeWidth={2} aria-hidden />
                              </span>
                            ))}
                        </span>
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
                      <HistoryRowActions
                        rowKey={rowKey}
                        isOpen={actionsMenuKey === rowKey}
                        onOpenChange={(open) => setActionsMenuKey(open ? rowKey : null)}
                        canMutate={row.kind === 'saved'}
                        onView={() => {
                          setSelected(row);
                        }}
                        onOpenDocument={() => openDocumentInSplitView(row)}
                        onShare={() => {
                          if (row.kind !== 'saved') return;
                          setShareRow(row);
                        }}
                        onRename={() => {
                          if (row.kind !== 'saved') return;
                          setRenameError(null);
                          setRenameValue(row.data.file_name);
                          setRenameRow(row);
                        }}
                        onDelete={() => {
                          if (row.kind !== 'saved') return;
                          setDeleteError(null);
                          setDeleteRow(row);
                        }}
                      />
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}

          {filteredRows.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-4 sm:gap-4">
            <span className="text-sm tabular-nums text-slate-600">
              Showing {startIdx}–{endIdx} of {filteredRows.length}
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
          )}
        </>
        )}
      </div>

      {shareRow && shareRow.kind === 'saved' && (
        <ShareSummaryDialog
          open
          onClose={() => setShareRow(null)}
          documentId={shareRow.data.document_id}
          fileName={shareRow.data.file_name}
          onSharesChanged={load}
        />
      )}

      {renameRow && renameRow.kind === 'saved' && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rename-dialog-title"
        >
          <button
            type="button"
            className="absolute inset-0 z-0 bg-slate-900/40"
            aria-label="Close"
            onClick={() => !renameBusy && setRenameRow(null)}
          />
          <div className="app-modal-panel relative z-10 w-full max-w-md p-6 shadow-xl">
            <h3 id="rename-dialog-title" className="text-lg font-semibold text-slate-900">
              Rename document
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              This name appears in your summaries and when opening PDFs.
            </p>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="mt-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              aria-label="Document name"
              disabled={renameBusy}
              maxLength={512}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitRename();
              }}
            />
            {renameError && (
              <p className="mt-2 text-sm text-red-600">{renameError}</p>
            )}
            <div className="mt-6 flex shrink-0 flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={renameBusy}
                onClick={() => setRenameRow(null)}
                className="shrink-0 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={renameBusy}
                onClick={() => void submitRename()}
                className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#3b82f6] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2563eb] disabled:opacity-50"
              >
                {renameBusy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteRow && deleteRow.kind === 'saved' && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            aria-label="Close"
            onClick={() => !deleteBusy && setDeleteRow(null)}
          />
          <div className="app-modal-panel relative w-full max-w-md p-6 shadow-xl">
            <h3 id="delete-dialog-title" className="text-lg font-semibold text-slate-900">
              Delete saved analysis?
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Remove <strong className="font-medium text-slate-900">{deleteRow.data.file_name}</strong>{' '}
              from your summaries. This does not delete the original document in storage.
            </p>
            {deleteError && (
              <p className="mt-3 text-sm text-red-600">{deleteError}</p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => setDeleteRow(null)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => void confirmDelete()}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteBusy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
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
          <div className="app-modal-panel relative flex max-h-[min(92vh,920px)] w-full max-w-5xl flex-col overflow-hidden shadow-xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-6 py-5">
              <div className="min-w-0">
                <h3
                  id="summary-dialog-title"
                  className="flex min-w-0 items-center gap-2 truncate font-semibold text-slate-900"
                >
                  <span className="min-w-0 truncate">{selected.data.file_name}</span>
                  {showSharedUserIcon(selected) &&
                    (selected.kind === 'saved' ? (
                      <button
                        type="button"
                        className="inline-flex shrink-0 rounded p-0.5 text-blue-500 transition-colors hover:bg-blue-50 focus-visible:outline focus-visible:ring-2 focus-visible:ring-blue-400"
                        title={`${sharedUserIconTitle(selected)} — click to manage sharing`}
                        aria-label="Manage sharing"
                        onClick={() => {
                          setShareRow(selected);
                          setSelected(null);
                        }}
                      >
                        <Waypoints className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
                      </button>
                    ) : (
                      <span
                        className="inline-flex shrink-0 text-blue-500"
                        title={sharedUserIconTitle(selected)}
                        aria-hidden
                      >
                        <Waypoints className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
                      </span>
                    ))}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {analysisTypeLabel(selected.data.analysis_type)} ·{' '}
                  {formatSavedAt(
                    selected.kind === 'saved'
                      ? selected.data.saved_at
                      : selected.data.shared_at
                  )}
                  {selected.kind === 'shared' && (
                    <span className="ml-1.5 text-blue-500">· Shared with you</span>
                  )}
                  {selected.kind === 'saved' && (selected.data.share_count ?? 0) > 0 && (
                    <span className="ml-1.5 text-blue-500">· Shared with others</span>
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
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
              <ClinicalSummaryMarkdown>{selected.data.summary}</ClinicalSummaryMarkdown>
            </div>
            <div className="flex shrink-0 justify-end border-t border-slate-100 bg-slate-50/80 px-6 py-4">
              <button
                type="button"
                disabled={pdfDownloadBusy}
                onClick={() => {
                  void (async () => {
                    setPdfDownloadBusy(true);
                    try {
                      await downloadSummaryPdf(selected.data.summary, selected.data.file_name);
                    } finally {
                      setPdfDownloadBusy(false);
                    }
                  })();
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-[#3b82f6] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#2563eb] disabled:cursor-wait disabled:opacity-80"
              >
                {pdfDownloadBusy ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" strokeWidth={2} aria-hidden />
                ) : (
                  <Download className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                )}
                {pdfDownloadBusy ? 'Preparing PDF…' : 'Download PDF'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
