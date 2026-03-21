import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { fetchAuthSession } from 'aws-amplify/auth';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<'loading' | 'ok' | 'fail'>('loading');
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    fetchAuthSession()
      .then((session) => {
        if (cancelled) return;
        setAuth(session.tokens?.idToken ? 'ok' : 'fail');
      })
      .catch(() => {
        if (!cancelled) setAuth('fail');
      });
    return () => { cancelled = true; };
  }, []);

  if (auth === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-emerald-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (auth === 'fail') {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
