import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AppShell } from './components/Layout/AppShell';
import { ProtectedRoute } from './components/Layout/ProtectedRoute';
import { LoginForm } from './components/Auth/LoginForm';
import { DocumentUploader } from './components/Upload/DocumentUploader';
import { HistoryPage } from './pages/HistoryPage';

export default function App() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
    <Routes>
      <Route
        path="/login"
        element={
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
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
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </div>
  );
}
