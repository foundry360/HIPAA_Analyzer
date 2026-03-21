import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import {
  createDocumentShare,
  fetchSharesForDocument,
  revokeDocumentShare,
  searchUsersForShare,
  type DocumentShareRow,
  type UserSearchHit
} from '../../api/shares';

function maskSub(sub: string): string {
  if (sub.length <= 8) return sub;
  return `${sub.slice(0, 4)}…${sub.slice(-4)}`;
}

function displayShareRecipient(s: DocumentShareRow): string {
  const e = s.shared_with_email?.trim();
  if (e) return e;
  return `User ${maskSub(s.shared_with_user_id)}`;
}

export function ShareSummaryDialog({
  open,
  onClose,
  documentId,
  fileName
}: {
  open: boolean;
  onClose: () => void;
  documentId: string;
  fileName: string;
}) {
  const [email, setEmail] = useState('');
  const [shares, setShares] = useState<DocumentShareRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<UserSearchHit[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const comboRef = useRef<HTMLDivElement>(null);

  const loadShares = useCallback(async () => {
    setListLoading(true);
    setError(null);
    try {
      const list = await fetchSharesForDocument(documentId);
      setShares(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load shares');
      setShares([]);
    } finally {
      setListLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    if (!open) return;
    setEmail('');
    setSuggestions([]);
    setSuggestOpen(false);
    void loadShares();
  }, [open, documentId, loadShares]);

  useEffect(() => {
    if (!open) return;
    const q = email.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const hits = await searchUsersForShare(q);
          const subs = new Set(shares.map((s) => s.shared_with_user_id));
          const emails = new Set(
            shares.map((s) => s.shared_with_email?.trim().toLowerCase()).filter(Boolean) as string[]
          );
          const filtered = hits.filter(
            (h) => !subs.has(h.sub) && !emails.has(h.email.toLowerCase())
          );
          setSuggestions(filtered);
          setSuggestOpen(true);
        } catch {
          setSuggestions([]);
        } finally {
          setSearchLoading(false);
        }
      })();
    }, 280);
    return () => window.clearTimeout(t);
  }, [email, open, shares]);

  useEffect(() => {
    if (!suggestOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!comboRef.current?.contains(e.target as Node)) {
        setSuggestOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [suggestOpen]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      await createDocumentShare({ documentId, email: trimmed, fileName });
      setEmail('');
      setSuggestions([]);
      setSuggestOpen(false);
      await loadShares();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Share failed');
    } finally {
      setLoading(false);
    }
  };

  const onRevoke = async (shareId: string) => {
    setRevokingId(shareId);
    setError(null);
    try {
      await revokeDocumentShare(shareId);
      await loadShares();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove access');
    } finally {
      setRevokingId(null);
    }
  };

  const pickSuggestion = (hit: UserSearchHit) => {
    setEmail(hit.email);
    setSuggestOpen(false);
    setSuggestions([]);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-dialog-title"
    >
      <div className="app-modal-panel flex max-h-[min(90vh,560px)] w-full max-w-md flex-col shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 id="share-dialog-title" className="text-lg font-semibold text-slate-900">
            Share analysis
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <p className="text-sm text-slate-600">
            Start typing a colleague&apos;s <strong>sign-in email</strong> to search, or enter the full
            address. They can read the summary and open the document from Summaries.
          </p>

          <form onSubmit={(e) => void onSubmit(e)} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-stretch">
            <div ref={comboRef} className="relative min-w-0 flex-1">
              <input
                type="text"
                inputMode="email"
                autoComplete="off"
                placeholder="Search or type email…"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => {
                  if (email.trim().length >= 2 && suggestions.length > 0) setSuggestOpen(true);
                }}
                aria-autocomplete="list"
                aria-expanded={suggestOpen}
                aria-controls="share-email-suggestions"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              {searchLoading && (
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
                  <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-hidden />
                </span>
              )}
              {suggestOpen && suggestions.length > 0 && (
                <ul
                  id="share-email-suggestions"
                  role="listbox"
                  className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
                >
                  {suggestions.map((hit) => (
                    <li key={hit.sub} role="option">
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm text-slate-900 hover:bg-slate-50"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pickSuggestion(hit)}
                      >
                        {hit.email}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 sm:self-stretch"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : 'Share'}
            </button>
          </form>

          {error && (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {error}
            </p>
          )}

          <div className="mt-6">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              People with access
            </h3>
            {listLoading ? (
              <p className="mt-2 text-sm text-slate-500">Loading…</p>
            ) : shares.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Not shared with anyone yet.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {shares.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate text-slate-700" title={displayShareRecipient(s)}>
                      {displayShareRecipient(s)}
                    </span>
                    <button
                      type="button"
                      onClick={() => void onRevoke(s.id)}
                      disabled={revokingId === s.id}
                      className="shrink-0 text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                    >
                      {revokingId === s.id ? '…' : 'Remove'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
