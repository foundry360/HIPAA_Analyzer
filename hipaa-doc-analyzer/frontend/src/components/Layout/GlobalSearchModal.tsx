import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Search, Waypoints, X } from 'lucide-react';
import { fetchSavedSummaries } from '../../api/savedSummaries';
import { ANALYSIS_TYPE_LABELS } from '../Upload/AnalysisTypeSelector';
import type { AnalysisType, HistoryTableRow, SavedSummaryItem, SharedWithMeItem } from '../../types';
import { pushRecentKey, readRecentKeys } from '../../utils/globalSearchRecent';
import {
  mergeHistoryRows,
  rowKey,
  rowTimestampMs,
  sharedUserIconTitle,
  showSharedUserIcon
} from '../../utils/historyRows';

const MS_DAY = 86400000;

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function analysisTypeLabel(t: string): string {
  return ANALYSIS_TYPE_LABELS[t as AnalysisType] ?? t;
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  } catch {
    return iso;
  }
}

function filterByQuery(rows: HistoryTableRow[], q: string): HistoryTableRow[] {
  const s = q.trim().toLowerCase();
  if (!s) return rows;
  return rows.filter((row) => {
    const d = row.data;
    const name = d.file_name.toLowerCase();
    const type = analysisTypeLabel(d.analysis_type).toLowerCase();
    const rawType = d.analysis_type.toLowerCase();
    return name.includes(s) || type.includes(s) || rawType.includes(s);
  });
}

function recentRows(merged: HistoryTableRow[], recentKeys: string[]): HistoryTableRow[] {
  const byKey = new Map(merged.map((r) => [rowKey(r), r]));
  return recentKeys.map((k) => byKey.get(k)).filter(Boolean) as HistoryTableRow[];
}

function todayRows(merged: HistoryTableRow[]): HistoryTableRow[] {
  const t0 = startOfTodayMs();
  return merged.filter((row) => rowTimestampMs(row) >= t0);
}

/** Rolling 7 days, excluding today (same calendar day). */
function past7DaysRows(merged: HistoryTableRow[]): HistoryTableRow[] {
  const now = Date.now();
  const t0 = startOfTodayMs();
  const after = now - 7 * MS_DAY;
  return merged.filter((row) => {
    const t = rowTimestampMs(row);
    return t >= after && t < t0;
  });
}

/** Between 7 and 30 days ago (non-overlapping with Past 7 days / Today). */
function past30DaysRows(merged: HistoryTableRow[]): HistoryTableRow[] {
  const now = Date.now();
  const after30 = now - 30 * MS_DAY;
  const after7 = now - 7 * MS_DAY;
  return merged.filter((row) => {
    const t = rowTimestampMs(row);
    return t >= after30 && t < after7;
  });
}

type Props = {
  open: boolean;
  onClose: () => void;
};

function SearchResultRow({
  row,
  onSelect
}: {
  row: HistoryTableRow;
  onSelect: (row: HistoryTableRow) => void;
}) {
  const d = row.data;
  const when = row.kind === 'saved' ? row.data.saved_at : row.data.shared_at;
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(row)}
        className="flex w-full items-start gap-2 px-5 py-3.5 text-left text-sm transition-colors hover:bg-slate-50"
      >
        <FileText
          className="mt-0.5 h-4 w-4 shrink-0 text-slate-400"
          strokeWidth={1.75}
          aria-hidden
        />
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="flex min-w-0 items-center gap-1.5 font-medium text-slate-900">
            {showSharedUserIcon(row) && (
              <span
                className="inline-flex shrink-0 text-blue-500"
                title={sharedUserIconTitle(row)}
              >
                <Waypoints className="h-4 w-4" strokeWidth={2} aria-hidden />
              </span>
            )}
            <span className="min-w-0 truncate">{d.file_name}</span>
          </span>
          <span className="text-xs text-slate-500">
            {analysisTypeLabel(d.analysis_type)}
          </span>
          <span className="text-xs text-slate-400">{formatWhen(when)}</span>
        </div>
      </button>
    </li>
  );
}

export function GlobalSearchModal({ open, onClose }: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<SavedSummaryItem[]>([]);
  const [sharedWithMe, setSharedWithMe] = useState<SharedWithMeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentKeys, setRecentKeys] = useState<string[]>(() => readRecentKeys());

  const merged = useMemo(
    () => mergeHistoryRows(items, sharedWithMe),
    [items, sharedWithMe]
  );

  const sections = useMemo(() => {
    const q = query;
    return [
      {
        id: 'recent' as const,
        title: 'Recent searches',
        rows: filterByQuery(recentRows(merged, recentKeys), q),
        emptyHint: 'No recent items yet. Open an analysis from Summaries or pick one below.'
      },
      {
        id: 'today' as const,
        title: 'Today',
        rows: filterByQuery(todayRows(merged), q),
        emptyHint: 'No analyses from today.'
      },
      {
        id: '7d' as const,
        title: 'Past 7 days',
        rows: filterByQuery(past7DaysRows(merged), q),
        emptyHint: 'No analyses in the last 7 days (excluding today).'
      },
      {
        id: '30d' as const,
        title: 'Past 30 days',
        rows: filterByQuery(past30DaysRows(merged), q),
        emptyHint: 'No analyses between 7 and 30 days ago.'
      }
    ];
  }, [merged, recentKeys, query]);

  const totalMatches = useMemo(() => sections.reduce((n, s) => n + s.rows.length, 0), [sections]);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const { items: saved, sharedWithMe: shared } = await fetchSavedSummaries();
      setItems(saved);
      setSharedWithMe(shared);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
      setItems([]);
      setSharedWithMe([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setRecentKeys(readRecentKeys());
    void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) {
      setQuery('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleSelect = (row: HistoryTableRow) => {
    const key = rowKey(row);
    pushRecentKey(key);
    setRecentKeys(readRecentKeys());
    navigate(`/history?open=${encodeURIComponent(key)}`);
    onClose();
    setQuery('');
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-6 pt-[min(6rem,12vh)] sm:p-8 sm:pt-[10vh]">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50"
        aria-label="Close search"
        onClick={onClose}
      />
      <div
        className="app-modal-panel relative flex max-h-[min(88vh,800px)] w-full max-w-4xl flex-col overflow-hidden shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="global-search-title"
      >
        <div className="shrink-0 border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 shrink-0 text-slate-400" strokeWidth={1.75} aria-hidden />
            <input
              id="global-search-input"
              type="search"
              autoFocus
              autoComplete="off"
              placeholder="Search by document name or analysis type…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-w-0 flex-1 border-0 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0"
            />
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              aria-label="Close"
            >
              <X className="h-5 w-5" strokeWidth={2} />
            </button>
          </div>
          <h2 id="global-search-title" className="sr-only">
            Search analyses
          </h2>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {loading && <p className="px-4 py-6 text-center text-sm text-slate-500">Loading…</p>}
          {!loading && error && (
            <p className="px-4 py-4 text-center text-sm text-red-600">{error}</p>
          )}
          {!loading && !error && query.trim() && totalMatches === 0 && (
            <p className="px-4 py-8 text-center text-sm text-slate-500">
              No matching analyses. Try a different search.
            </p>
          )}
          {!loading &&
            !error &&
            !(query.trim() && totalMatches === 0) &&
            sections.map(({ id, title, rows, emptyHint }) => (
              <section key={id} className="mb-6 last:mb-0" aria-labelledby={`global-search-section-${id}`}>
                <h3
                  id={`global-search-section-${id}`}
                  className="sticky top-0 z-10 bg-white px-4 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  {title}
                </h3>
                {rows.length > 0 ? (
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100 bg-slate-50/50">
                    {rows.map((row) => (
                      <SearchResultRow key={rowKey(row)} row={row} onSelect={handleSelect} />
                    ))}
                  </ul>
                ) : (
                  <p className="px-4 pb-1 text-sm text-slate-400">{emptyHint}</p>
                )}
              </section>
            ))}
        </div>
      </div>
    </div>
  );
}
