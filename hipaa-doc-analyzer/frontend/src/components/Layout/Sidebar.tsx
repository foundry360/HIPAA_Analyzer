import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useLayout } from '../../context/LayoutContext';
import {
  ClipboardPlus,
  FileText,
  PanelLeft,
  PanelRight,
  Search,
  Users,
  type LucideIcon
} from 'lucide-react';
import { fetchSavedSummaries } from '../../api/savedSummaries';
import { useAdmin } from '../../context/AdminContext';
import type { HistoryTableRow } from '../../types';
import { mergeHistoryRows, rowKey } from '../../utils/historyRows';
import { GlobalSearchModal } from './GlobalSearchModal';

const baseNav: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: 'Create Summary', icon: ClipboardPlus, end: true },
  { to: '/history', label: 'Summaries', icon: FileText }
];

export function Sidebar() {
  const { admin } = useAdmin();
  const { sidebarCollapsed: collapsed, toggleSidebarCollapsed: toggle } = useLayout();
  const [searchOpen, setSearchOpen] = useState(false);
  const [recentRows, setRecentRows] = useState<HistoryTableRow[]>([]);

  const nav = useMemo(() => {
    const items = [...baseNav];
    if (admin) {
      items.push({ to: '/settings/users', label: 'Users', icon: Users });
    }
    return items;
  }, [admin]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { items, sharedWithMe } = await fetchSavedSummaries();
        if (cancelled) return;
        const merged = mergeHistoryRows(items, sharedWithMe);
        setRecentRows(merged.slice(0, 15));
      } catch {
        if (!cancelled) setRecentRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
    <aside
      className={[
        'flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white transition-[width] duration-200 ease-out',
        collapsed ? 'w-[4.25rem]' : 'w-56'
      ].join(' ')}
    >
      {!collapsed && (
        <div className="shrink-0 border-b border-slate-100 px-3 py-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              strokeWidth={1.75}
              aria-hidden
            />
            <input
              type="search"
              readOnly
              placeholder="Search analyses…"
              onFocus={() => setSearchOpen(true)}
              onClick={() => setSearchOpen(true)}
              className="w-full cursor-pointer rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              aria-label="Search analyses"
              aria-haspopup="dialog"
              aria-expanded={searchOpen}
              autoComplete="off"
            />
          </div>
        </div>
      )}
      {collapsed && (
        <div className="shrink-0 border-b border-slate-100 p-2">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex w-full justify-center rounded-lg p-2.5 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
            aria-label="Search analyses"
            title="Search analyses"
          >
            <Search className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden />
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <nav className="shrink-0 space-y-0.5 p-2" aria-label="Main">
          {nav.map(({ to, label, icon: Icon, end }, index) => (
            <div key={to} className="contents">
              <NavLink
                to={to}
                end={end ?? false}
                title={label}
                aria-label={label}
                className={({ isActive }) =>
                  [
                    'flex items-center gap-2.5 rounded-lg py-2.5 text-sm font-medium transition-colors',
                    collapsed ? 'justify-center px-2' : 'px-3',
                    isActive
                      ? 'bg-blue-50 text-blue-500'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  ].join(' ')
                }
              >
                <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden />
                {!collapsed && <span>{label}</span>}
              </NavLink>
              {index === 0 && (
                <div
                  className="mx-1 my-1.5 border-b border-slate-200"
                  aria-hidden="true"
                />
              )}
            </div>
          ))}
        </nav>

        {!collapsed && (
          <>
            <div className="mx-2 border-b border-slate-200" aria-hidden="true" />
            <section className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-2 pb-2 pt-3">
              <h2 className="shrink-0 px-1 text-xs font-semibold tracking-wide text-slate-500">
                Your Recent Summaries
              </h2>
              <ul
                className="min-h-0 flex-1 space-y-0.5 overflow-y-auto"
                aria-label="Your recent summaries"
              >
                {recentRows.length === 0 ? (
                  <li className="px-1 text-xs text-slate-400">No summaries yet</li>
                ) : (
                  recentRows.map((row) => {
                    const name = row.data.file_name;
                    const open = encodeURIComponent(rowKey(row));
                    return (
                      <li key={rowKey(row)}>
                        <Link
                          to={`/history?open=${open}`}
                          title={name}
                          className="flex min-w-0 max-w-full items-center gap-2 rounded-md px-1 py-1.5 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900"
                        >
                          <FileText
                            className="h-4 w-4 shrink-0 text-slate-400"
                            strokeWidth={1.75}
                            aria-hidden
                          />
                          <span className="min-w-0 truncate">{name}</span>
                        </Link>
                      </li>
                    );
                  })
                )}
              </ul>
            </section>
          </>
        )}
      </div>

      <div className="shrink-0 border-t border-slate-200 p-2">
        <button
          type="button"
          onClick={toggle}
          className={[
            'flex w-full items-center rounded-lg p-2.5 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-500',
            collapsed ? 'justify-center' : 'justify-end pr-1'
          ].join(' ')}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <PanelRight className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden />
          ) : (
            <PanelLeft className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden />
          )}
        </button>
      </div>
    </aside>
    <GlobalSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
