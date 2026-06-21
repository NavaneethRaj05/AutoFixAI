import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login        from './pages/Login.jsx';
import Dashboard    from './pages/Dashboard.jsx';
import ReviewDetail from './pages/ReviewDetail.jsx';
import Leaderboard  from './pages/Leaderboard.jsx';

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/reviews/:id"
          element={
            <ProtectedRoute>
              <ReviewDetail />
            </ProtectedRoute>
          }
        />

        <Route
          path="/leaderboard"
          element={
            <ProtectedRoute>
              <Leaderboard />
            </ProtectedRoute>
          }
        />

        {/* Catch-all → dashboard */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
