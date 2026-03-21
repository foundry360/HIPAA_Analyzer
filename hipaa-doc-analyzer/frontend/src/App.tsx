import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AppShell } from './components/Layout/AppShell';
import { ProtectedRoute } from './components/Layout/ProtectedRoute';
import { LoginForm } from './components/Auth/LoginForm';
import { DocumentUploader } from './components/Upload/DocumentUploader';
import { HistoryPage } from './pages/HistoryPage';
import { ManageUsersPage } from './pages/ManageUsersPage';

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
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </div>
  );
}
