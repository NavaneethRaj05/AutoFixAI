import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login        from './pages/Login.jsx';
import Dashboard    from './pages/Dashboard.jsx';
import ReviewDetail from './pages/ReviewDetail.jsx';
import Leaderboard  from './pages/Leaderboard.jsx';

function getToken() {
  return localStorage.getItem('token');
}

function validateToken(token) {
  // Add token validation logic here
  return token !== null && token !== undefined;
}

function ProtectedRoute({ children }) {
  const token = getToken();
  if (!validateToken(token)) return <Navigate to="/login" replace />;
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

        {/* Catch-all → 404 page */}
        <Route path="*" element={<div>404 Page Not Found</div>} />
      </Routes>
    </BrowserRouter>
  );
}