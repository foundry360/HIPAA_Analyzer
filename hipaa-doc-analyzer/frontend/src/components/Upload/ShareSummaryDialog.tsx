import { useCallback, useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import {
  createDocumentShare,
  fetchSharesForDocument,
  revokeDocumentShare,
  type DocumentShareRow
} from '../../api/shares';

function maskSub(sub: string): string {
  if (sub.length <= 8) return sub;
  return `${sub.slice(0, 4)}…${sub.slice(-4)}`;
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
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

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
    void loadShares();
  }, [open, documentId, loadShares]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      await createDocumentShare({ documentId, email: trimmed, fileName });
      setEmail('');
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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-dialog-title"
    >
      <div className="flex max-h-[min(90vh,560px)] w-full max-w-md flex-col rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
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

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <p className="text-sm text-slate-600">
            Enter the recipient&apos;s <strong>sign-in email</strong> (must be an existing user in this
            app). They can read the summary and open the document from History.
          </p>

          <form onSubmit={(e) => void onSubmit(e)} className="mt-4 flex gap-2">
            <input
              type="email"
              autoComplete="email"
              placeholder="colleague@hospital.org"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="shrink-0 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Share'}
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
                    <span className="truncate text-slate-700" title={s.shared_with_user_id}>
                      User {maskSub(s.shared_with_user_id)}
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
