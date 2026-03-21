import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { fetchAdminMe } from '../api/adminUsers';

type AdminState = { admin: boolean; loading: boolean };

const AdminContext = createContext<AdminState>({ admin: false, loading: true });

export function AdminProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function refreshAdmin() {
      setLoading(true);
      try {
        const session = await fetchAuthSession();
        if (!alive) return;
        if (!session.tokens?.idToken) {
          setAdmin(false);
          return;
        }
        const r = await fetchAdminMe();
        if (!alive) return;
        setAdmin(r.admin);
      } catch {
        if (!alive) return;
        setAdmin(false);
      } finally {
        if (alive) setLoading(false);
      }
    }

    void refreshAdmin();

    const remove = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signedOut') {
        setAdmin(false);
        setLoading(false);
      } else if (payload.event === 'signedIn' || payload.event === 'tokenRefresh') {
        void refreshAdmin();
      }
    });

    return () => {
      alive = false;
      remove();
    };
  }, []);

  return <AdminContext.Provider value={{ admin, loading }}>{children}</AdminContext.Provider>;
}

export function useAdmin(): AdminState {
  return useContext(AdminContext);
}
