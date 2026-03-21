const STORAGE_KEY = 'hipaa-global-search-recent';
const MAX = 10;

/** Stored keys match `rowKey`: saved:<uuid> or shared:<uuid> */
export function readRecentKeys(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string').slice(0, MAX);
  } catch {
    return [];
  }
}

export function pushRecentKey(key: string): void {
  try {
    const prev = readRecentKeys().filter((k) => k !== key);
    const next = [key, ...prev].slice(0, MAX);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
