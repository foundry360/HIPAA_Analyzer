import { Outlet } from 'react-router-dom';
import { AdminProvider } from '../../context/AdminContext';
import { LayoutProvider } from '../../context/LayoutContext';
import { ChatPanel } from './ChatPanel';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

export function AppShell() {
  return (
    <AdminProvider>
      <LayoutProvider>
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-white">
          <Header />
          <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
            <Sidebar />
            <ChatPanel />
            <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <Outlet />
            </main>
          </div>
        </div>
      </LayoutProvider>
    </AdminProvider>
  );
}
