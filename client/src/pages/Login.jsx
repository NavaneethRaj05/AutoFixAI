import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api.js';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await api.post('/auth/login', { username, password });
      localStorage.setItem('token', res.data.data.token);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed — check your credentials');
    } finally {
      setLoading(false);
    }
  }

  async function handleDemoLogin() {
    setError('');
    setLoading(true);

    try {
      const res = await api.post('/auth/login', { username: 'demo', password: 'demo' });
      localStorage.setItem('token', res.data.data.token);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Demo login failed — please try again');
    } finally {
      setLoading(false);
    }
  }

  const handleMouseMove = (e) => {
    const card = e.currentTarget;
    const box = card.getBoundingClientRect();
    const x = e.clientX - box.left - box.width / 2;
    const y = e.clientY - box.top - box.height / 2;
    const rx = -(y / (box.height / 2)) * 8;
    const ry = (x / (box.width / 2)) * 8;
    card.style.setProperty('--rx', `${rx}deg`);
    card.style.setProperty('--ry', `${ry}deg`);
  };

  const handleMouseLeave = (e) => {
    const card = e.currentTarget;
    card.style.setProperty('--rx', '0deg');
    card.style.setProperty('--ry', '0deg');
  };

  return (
    <div className="min-h-screen animated-bg flex items-center justify-center p-4">
      {/* Decorative orbs */}
      <div className="fixed top-1/4 -left-32 w-96 h-96 bg-brand-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-1/4 -right-32 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm animate-slide-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 shadow-glow mb-4">
            <span className="text-3xl">💎</span>
          </div>
          <h1 className="text-3xl font-extrabold bg-gradient-to-r from-white via-brand-200 to-purple-400 bg-clip-text text-transparent">PrismFlow</h1>
          <p className="text-slate-400 text-xs mt-2 italic px-4 leading-relaxed font-medium">"Break every pull request into its true colors."</p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="glass tilt-card rounded-2xl p-6 space-y-4 shadow-[0_8px_30px_rgb(0,0,0,0.12)]"
          id="login-form"
        >
          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="username" className="block text-sm font-medium text-slate-300 mb-1.5">
              Username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              required
              className="input"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              className="input"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            id="login-submit"
            type="submit"
            disabled={loading}
            className="btn-primary w-full justify-center"
          >
            {loading ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Signing in…
              </>
            ) : (
              'Sign in'
            )}
          </button>

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-slate-700/40"></div>
            <span className="flex-shrink mx-3 text-slate-500 text-xs uppercase font-semibold tracking-wider">Or</span>
            <div className="flex-grow border-t border-slate-700/40"></div>
          </div>

          <button
            id="demo-login-btn"
            type="button"
            onClick={handleDemoLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm bg-gradient-to-r from-purple-600/30 to-indigo-600/30 border border-purple-500/40 hover:from-purple-500/50 hover:to-indigo-500/50 text-purple-200 hover:text-white transition-all duration-200 shadow-glow-sm hover:shadow-glow active:scale-95 disabled:opacity-50"
          >
            🚀 Try Demo Mode
          </button>
        </form>

        <p className="text-center text-slate-500 text-xs mt-6">
          Need an account?{' '}
          <code className="font-mono bg-white/5 px-1.5 py-0.5 rounded text-slate-300">
            POST /api/auth/register
          </code>{' '}
          (dev only)
        </p>
      </div>
    </div>
  );
}
