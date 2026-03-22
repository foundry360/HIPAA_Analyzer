import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AppShell } from './components/Layout/AppShell';
import { ProtectedRoute } from './components/Layout/ProtectedRoute';
import { LoginForm } from './components/Auth/LoginForm';
import { DocumentUploader } from './components/Upload/DocumentUploader';
import { HistoryPage } from './pages/HistoryPage';
import { ManageUsersPage } from './pages/ManageUsersPage';

/** Dev-only; module is not loaded in production builds (see vite tree-shaking). */
const RedactedPreviewTestPage = import.meta.env.DEV
  ? lazy(() => import('./pages/dev/RedactedPreviewTestPage'))
  : null;

export default function App() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
    <Routes>
      <Route
        path="/login"
        element={
          <div className="flex min-h-screen min-h-[100dvh] flex-1 flex-col">
            <LoginForm onSuccess={() => navigate('/', { replace: true })} />
          </div>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<DocumentUploader />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="settings/users" element={<ManageUsersPage />} />
        {RedactedPreviewTestPage && (
          <Route
            path="dev/redacted-preview"
            element={
              <Suspense
                fallback={
                  <div className="flex flex-1 items-center justify-center p-6 text-sm text-slate-600">
                    Loading…
                  </div>
                }
              >
                <RedactedPreviewTestPage />
              </Suspense>
            }
          />
        )}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </div>
  );
}
