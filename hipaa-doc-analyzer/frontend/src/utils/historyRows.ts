import type { HistoryTableRow, SavedSummaryItem, SharedWithMeItem } from '../types';

export function mergeHistoryRows(
  items: SavedSummaryItem[],
  sharedWithMe: SharedWithMeItem[]
): HistoryTableRow[] {
  const saved: HistoryTableRow[] = items.map((data) => ({ kind: 'saved', data }));
  const shared: HistoryTableRow[] = sharedWithMe.map((data) => ({ kind: 'shared', data }));
  return [...saved, ...shared].sort((a, b) => rowTimestampMs(b) - rowTimestampMs(a));
}

export function rowTimestampMs(row: HistoryTableRow): number {
  return new Date(row.kind === 'saved' ? row.data.saved_at : row.data.shared_at).getTime();
}

export function rowKey(row: HistoryTableRow): string {
  return row.kind === 'saved' ? `saved:${row.data.id}` : `shared:${row.data.share_id}`;
}

export function parseOpenKey(key: string): { kind: 'saved' | 'shared'; id: string } | null {
  const idx = key.indexOf(':');
  if (idx <= 0) return null;
  const kind = key.slice(0, idx);
  const id = key.slice(idx + 1);
  if (kind !== 'saved' && kind !== 'shared') return null;
  if (!id) return null;
  return { kind: kind as 'saved' | 'shared', id };
}
