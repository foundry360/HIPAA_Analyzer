import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { fetchAuthSession } from 'aws-amplify/auth';

/** Fails the gate if Cognito session check hangs (e.g. unreachable IdP). */
const SESSION_GATE_MS = 30_000;

type GateState =
  | { kind: 'loading' }
  | { kind: 'ok' }
  | { kind: 'fail'; message?: string };

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(onTimeout()), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [gate, setGate] = useState<GateState>({ kind: 'loading' });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await withTimeout(
          (async () => {
            /** Do not call getCurrentUser() before this gate — it can throw briefly right after sign-in and bounce users back to /login. */
            const session = await fetchAuthSession({ forceRefresh: false });
            if (!active) return;

            if (!session.tokens?.idToken) {
              if (active) setGate({ kind: 'fail' });
              return;
            }

            if (active) setGate({ kind: 'ok' });
          })(),
          SESSION_GATE_MS,
          () =>
            new Error(
              'Session check timed out. Confirm your connection and Cognito configuration, then try again.'
            )
        );
      } catch (e) {
        if (!active) return;
        const message = e instanceof Error ? e.message : undefined;
        setGate({ kind: 'fail', message });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (gate.kind === 'loading') {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  if (gate.kind === 'fail') {
    return (
      <Navigate to="/login" state={{ accessDeniedMessage: gate.message }} replace />
    );
  }

  return <>{children}</>;
}
