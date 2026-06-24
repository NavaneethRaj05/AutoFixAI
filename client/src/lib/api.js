import axios from 'axios';

const api = axios.create({
  baseURL: new URL(import.meta.env.VITE_API_URL || '/api', window.location.origin).href,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Request interceptor: attach JWT ──────────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    // Add token validation check
    if (isValidToken(token)) {
      config.headers.Authorization = `Bearer ${token}`;
    } else {
      localStorage.removeItem('token');
    }
  }
  return config;
});

// ── Response interceptor: handle 401 ────────────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    } else if (error.response?.status === 500) {
      // Handle server error
      console.error('Server error:', error);
    } else if (error.request) {
      // Handle network error
      console.error('Network error:', error);
    } else {
      // Handle other errors
      console.error('Unknown error:', error);
    }
    return Promise.reject(error);
  }
);

function isValidToken(token) {
  // Implement token validation logic here
  // For example, check if the token is expired or if it's a valid JWT
  return true; // Replace with actual validation logic
}

export default api;