import { useCallback, useEffect, useState } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import {
  createAdminUser,
  deleteAdminUser,
  fetchAdminRoster,
  fetchAdminUsers,
  grantDelegatedAdmin,
  revokeDelegatedAdmin,
  setAdminUserEnabled,
  type AdminRoster,
  type AdminUserRow
} from '../api/adminUsers';

function formatCreated(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  } catch {
    return iso;
  }
}

function roleLabel(row: AdminUserRow, roster: AdminRoster | null): string {
  if (!row.sub) return '—';
  if (!roster) return '—';
  const isPrimary = roster.primary?.sub != null && row.sub === roster.primary.sub;
  const isDelegated = roster.delegates.some((d) => d.sub === row.sub);
  if (isPrimary || isDelegated) return 'Admin';
  return 'User';
}

export function ManageUsersPage() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [roster, setRoster] = useState<AdminRoster | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [makeNewUserAdmin, setMakeNewUserAdmin] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createMessage, setCreateMessage] = useState<string | null>(null);
  const [busyUsername, setBusyUsername] = useState<string | null>(null);
  const [busyDeleteUsername, setBusyDeleteUsername] = useState<string | null>(null);
  const [mySub, setMySub] = useState<string | null>(null);
  const [adminEmail, setAdminEmail] = useState('');
  const [granting, setGranting] = useState(false);
  const [busyDelegateSub, setBusyDelegateSub] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [list, r] = await Promise.all([fetchAdminUsers(), fetchAdminRoster()]);
      setUsers(list);
      setRoster(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load data');
      setUsers([]);
      setRoster(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        const s = await fetchAuthSession();
        const sub = s.tokens?.idToken?.payload?.sub;
        setMySub(typeof sub === 'string' ? sub : null);
      } catch {
        setMySub(null);
      }
    })();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const email = newEmail.trim();
    if (!email) return;
    setCreating(true);
    setCreateMessage(null);
    setError(null);
    try {
      const created = await createAdminUser(email, { makeAdmin: makeNewUserAdmin });
      setNewEmail('');
      setMakeNewUserAdmin(false);
      setCreateMessage(
        created.message ??
          'Invitation or temporary password email sent if your user pool supports it.'
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setCreating(false);
    }
  }

  async function handleGrantAdmin(e: React.FormEvent) {
    e.preventDefault();
    const email = adminEmail.trim();
    if (!email) return;
    setGranting(true);
    setError(null);
    try {
      await grantDelegatedAdmin(email);
      setAdminEmail('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add administrator');
    } finally {
      setGranting(false);
    }
  }

  async function handleRevokeDelegate(sub: string) {
    setBusyDelegateSub(sub);
    setError(null);
    try {
      await revokeDelegatedAdmin(sub);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Remove failed');
    } finally {
      setBusyDelegateSub(null);
    }
  }

  async function toggleEnabled(row: AdminUserRow) {
    setBusyUsername(row.username);
    setError(null);
    try {
      await setAdminUserEnabled(row.username, !row.enabled);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusyUsername(null);
    }
  }

  async function handleDelete(row: AdminUserRow) {
    const label = row.email || row.username;
    if (
      !window.confirm(
        `Permanently delete ${label}? They will be removed and can no longer sign in.`
      )
    ) {
      return;
    }
    setBusyDeleteUsername(row.username);
    setError(null);
    try {
      await deleteAdminUser(row.username);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusyDeleteUsername(null);
    }
  }

  if (loading && users.length === 0 && !error) {
    return (
      <div className="flex min-h-0 flex-1 flex-col p-6">
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  if (error && users.length === 0) {
    const isAccessDenied = /forbidden|403|not authorized/i.test(error);
    const isDbSetup = /relation .* does not exist|app_config|admin_grants/i.test(error);

    return (
      <div className="flex min-h-0 flex-1 flex-col p-6">
        <h1 className="text-lg font-semibold text-slate-900">Manage users</h1>
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {isDbSetup
            ? 'The app could not load admin settings from the database. Deploy the latest API or run the database setup Lambda, then try again.'
            : error}
        </p>
        {isAccessDenied && (
          <p className="mt-2 text-sm text-slate-600">
            Only primary administrators, delegated administrators, or optional break-glass accounts can
            access this page.
          </p>
        )}
        {!isAccessDenied && !isDbSetup && (
          <p className="mt-2 text-sm text-slate-600">
            If this keeps happening, contact your administrator.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-slate-200 px-6 py-5">
        <h1 className="text-lg font-semibold text-slate-900">Manage users</h1>
        <p className="mt-1 text-sm text-slate-600">
          Primary and delegated administrators can invite users. New accounts are regular users unless you
          explicitly assign the administrator role when inviting or below.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-6">
        {error && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        <section className="mb-10 max-w-2xl">
          <h2 className="text-sm font-semibold text-slate-900">Administrators</h2>
          <p className="mt-1 text-sm text-slate-600">
            Delegated administrators can be added or removed here.
          </p>

          {roster?.primary && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <span className="font-medium text-slate-800">Primary</span>
              <span className="ml-2 text-slate-600">
                {roster.primary.email || roster.primary.sub}
              </span>
            </div>
          )}

          {roster && roster.delegates.length > 0 && (
            <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
              {roster.delegates.map((d) => (
                <li
                  key={d.sub}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                >
                  <span className="text-slate-800">
                    <span className="font-medium">Delegated</span>
                    <span className="ml-2 text-slate-600">{d.email || d.sub}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleRevokeDelegate(d.sub)}
                    disabled={busyDelegateSub === d.sub}
                    className="shrink-0 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {busyDelegateSub === d.sub ? '…' : 'Remove'}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handleGrantAdmin} className="mt-4 flex max-w-xl flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label htmlFor="delegate-email" className="block text-xs font-medium text-slate-600">
                Add administrator (existing user email)
              </label>
              <input
                id="delegate-email"
                type="email"
                autoComplete="off"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="colleague@hospital.org"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <button
              type="submit"
              disabled={granting || !adminEmail.trim()}
              className="shrink-0 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-50"
            >
              {granting ? 'Adding…' : 'Add administrator'}
            </button>
          </form>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-slate-900">Accounts</h2>
          <p className="mt-1 text-sm text-slate-600">Invite new users to the app.</p>

          <form onSubmit={handleCreate} className="mb-6 mt-4 max-w-xl space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <label htmlFor="new-user-email" className="block text-xs font-medium text-slate-600">
                  New user email
                </label>
                <input
                  id="new-user-email"
                  type="email"
                  autoComplete="off"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="colleague@hospital.org"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <button
                type="submit"
                disabled={creating || !newEmail.trim()}
                className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:pointer-events-none disabled:opacity-50"
              >
                {creating ? 'Inviting…' : 'Invite user'}
              </button>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={makeNewUserAdmin}
                onChange={(e) => setMakeNewUserAdmin(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              Also assign delegated administrator role
            </label>
          </form>
          {createMessage && (
            <p className="-mt-2 mb-6 text-sm text-emerald-800">{createMessage}</p>
          )}

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 font-medium text-slate-700">Email</th>
                  <th className="px-4 py-3 font-medium text-slate-700">Role</th>
                  <th className="px-4 py-3 font-medium text-slate-700">Status</th>
                  <th className="px-4 py-3 font-medium text-slate-700">Created</th>
                  <th className="px-4 py-3 font-medium text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((row) => (
                  <tr key={row.username} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 text-slate-900">{row.email || row.username}</td>
                    <td className="px-4 py-3 text-slate-600">{roleLabel(row, roster)}</td>
                    <td className="px-4 py-3 text-slate-600">
                      <span className={row.enabled ? 'text-emerald-700' : 'text-slate-500'}>
                        {row.enabled ? 'Enabled' : 'Disabled'} · {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatCreated(row.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void toggleEnabled(row)}
                          disabled={busyUsername === row.username}
                          className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                        >
                          {busyUsername === row.username
                            ? '…'
                            : row.enabled
                              ? 'Disable'
                              : 'Enable'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(row)}
                          disabled={
                            busyDeleteUsername === row.username ||
                            (mySub !== null && row.sub === mySub) ||
                            (roster?.primary?.sub != null && row.sub === roster.primary.sub)
                          }
                          title={
                            mySub !== null && row.sub === mySub
                              ? 'You cannot delete your own account'
                              : roster?.primary?.sub != null && row.sub === roster.primary.sub
                                ? 'Cannot delete the primary administrator here'
                                : undefined
                          }
                          className="rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 disabled:pointer-events-none disabled:opacity-40"
                        >
                          {busyDeleteUsername === row.username ? '…' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {users.length === 0 && !loading && (
            <p className="mt-4 text-sm text-slate-500">No users found.</p>
          )}
        </section>
      </div>
    </div>
  );
}
