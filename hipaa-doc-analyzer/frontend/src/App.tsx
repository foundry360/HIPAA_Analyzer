import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Header } from './components/Layout/Header';
import { ProtectedRoute } from './components/Layout/ProtectedRoute';
import { LoginForm } from './components/Auth/LoginForm';
import { DocumentUploader } from './components/Upload/DocumentUploader';

function Dashboard() {
  return (
    <>
      <Header />
      <main className="min-h-[calc(100vh-4rem)] py-8">
        <DocumentUploader />
      </main>
    </>
  );
}

export default function App() {
  const navigate = useNavigate();

  return (
    <Routes>
      <Route path="/login" element={<LoginForm onSuccess={() => navigate('/', { replace: true })} />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
