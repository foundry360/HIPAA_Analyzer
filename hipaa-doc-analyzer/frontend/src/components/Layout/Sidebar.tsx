import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  FileSearch,
  History as HistoryIcon,
  PanelLeft,
  PanelRight,
  Users,
  type LucideIcon
} from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';

const STORAGE_KEY = 'hipaa-sidebar-collapsed';

const baseNav: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: 'Analyze', icon: FileSearch, end: true },
  { to: '/history', label: 'History', icon: HistoryIcon }
];

export function Sidebar() {
  const { admin } = useAdmin();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  const toggle = useCallback(() => setCollapsed((c) => !c), []);

  const nav = useMemo(() => {
    const items = [...baseNav];
    if (admin) {
      items.push({ to: '/settings/users', label: 'Users', icon: Users });
    }
    return items;
  }, [admin]);

  return (
    <aside
      className={[
        'flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white transition-[width] duration-200 ease-out',
        collapsed ? 'w-[4.25rem]' : 'w-56'
      ].join(' ')}
    >
      {!collapsed && (
        <div className="shrink-0 border-b border-slate-100 px-4 py-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">HIPAA Analyzer</p>
          <h1 className="mt-1 font-semibold leading-tight text-slate-900">Clinical Documents</h1>
        </div>
      )}

      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2" aria-label="Main">
        {nav.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end ?? false}
            title={label}
            aria-label={label}
            className={({ isActive }) =>
              [
                'flex items-center gap-2.5 rounded-lg py-2.5 text-sm font-medium transition-colors',
                collapsed ? 'justify-center px-2' : 'px-3',
                isActive
                  ? 'bg-blue-50 text-blue-800'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              ].join(' ')
            }
          >
            <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

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
  );
}
