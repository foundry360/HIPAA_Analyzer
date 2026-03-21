import { Outlet } from 'react-router-dom';
import { AdminProvider } from '../../context/AdminContext';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

export function AppShell() {
  return (
    <AdminProvider>
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-white">
        <Header />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <Outlet />
          </main>
        </div>
      </div>
    </AdminProvider>
  );
}
