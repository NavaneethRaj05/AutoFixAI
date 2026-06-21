import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import api from '../lib/api.js';
import { SEVERITY } from '../components/SeverityBadge.jsx';

// ── Score circle ──────────────────────────────────────────────────────────────
function ScoreRing({ score }) {
  const color =
    score >= 80 ? '#4ade80' :
    score >= 60 ? '#fbbf24' :
    score >= 40 ? '#fb923c' : '#f87171';

  const radius      = 24;
  const circ        = 2 * Math.PI * radius;
  const strokeDash  = (score / 100) * circ;

  return (
    <div className="relative flex items-center justify-center w-16 h-16 shrink-0">
      <svg className="absolute inset-0 -rotate-90" width="64" height="64">
        <circle cx="32" cy="32" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
        <circle
          cx="32" cy="32" r={radius} fill="none"
          stroke={color} strokeWidth="5"
          strokeDasharray={`${strokeDash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      <span className="text-sm font-bold" style={{ color }}>{score}</span>
    </div>
  );
}

// ── Radar chart per developer ─────────────────────────────────────────────────
function DevRadar({ dev }) {
  const data = [
    { subject: 'Bugs',    value: Math.min(dev.bug, 20),         fill: SEVERITY.bug.color },
    { subject: 'Security', value: Math.min(dev.security, 10),   fill: SEVERITY.security.color },
    { subject: 'Perf',    value: Math.min(dev.performance, 10), fill: SEVERITY.performance.color },
    { subject: 'Style',   value: Math.min(dev.style, 10),       fill: SEVERITY.style.color },
  ];

  return (
    <ResponsiveContainer width={120} height={100}>
      <RadarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <PolarGrid stroke="rgba(255,255,255,0.1)" />
        <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 9 }} />
        <Radar dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.25} strokeWidth={1.5} />
        <Tooltip
          contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
          formatter={(v, name) => [v, name]}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

// ── Weekly report card ────────────────────────────────────────────────────────
function WeeklyReportCard() {
  const [report, setReport]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  async function generateReport() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/reviews/weekly-report');
      setReport(res.data.data);
    } catch (err) {
      setError('Failed to generate report');
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
    <div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="glass tilt-card rounded-2xl p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
            🤖 AI Weekly Report
          </h2>
          {report?.generatedAt && (
            <p className="text-xs text-slate-500 mt-0.5">
              Generated {new Date(report.generatedAt).toLocaleString()}
            </p>
          )}
        </div>
        <button
          id="generate-report-btn"
          onClick={generateReport}
          disabled={loading}
          className="btn-primary text-xs py-1.5 px-3"
        >
          {loading ? (
            <>
              <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Generating…
            </>
          ) : '✨ Generate Report'}
        </button>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {!report && !loading && (
        <p className="text-slate-500 text-sm">
          Click "Generate Report" to get an AI-written weekly code health summary for your team.
        </p>
      )}

      {report && (
        <div className="space-y-4 animate-fade-in">
          {/* Headline */}
          <div className="bg-brand-500/10 border border-brand-500/20 rounded-xl px-4 py-3">
            <p className="text-brand-300 font-semibold text-sm">{report.headline}</p>
          </div>

          {/* Insights */}
          {report.insights?.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Insights</h3>
              <ul className="space-y-2">
                {report.insights.map((insight, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                    <span className="text-brand-400 mt-0.5 shrink-0">→</span>
                    {insight}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommendations */}
          {report.recommendations?.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Recommendations</h3>
              <ul className="space-y-2">
                {report.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                    <span className="text-amber-400 mt-0.5 shrink-0">💡</span>
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Leaderboard page ─────────────────────────────────────────────────────
export default function Leaderboard() {
  const navigate = useNavigate();
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);

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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/reviews/leaderboard');
      setLeaderboard(res.data.data);
    } catch {
      setError('Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function logout() {
    localStorage.removeItem('token');
    navigate('/login');
  }

  const rankMedal = (i) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;

  return (
    <div className="min-h-screen animated-bg">
      <div className="fixed top-0 right-0 w-[600px] h-[400px] bg-brand-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Navbar */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-surface-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center gap-4">
          <Link to="/" className="btn-ghost text-sm">← Dashboard</Link>
          <div className="h-5 w-px bg-white/20" />
          <span className="text-2xl">🏆</span>
          <span className="font-bold text-white">Developer Leaderboard</span>
          <div className="ml-auto flex items-center gap-3">
            <button id="refresh-leaderboard-btn" onClick={load} className="btn-ghost text-sm">↺ Refresh</button>
            <button onClick={logout} className="btn-ghost text-red-400 hover:text-red-300 text-sm">Sign out</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 animate-fade-in space-y-8">
        <div>
          <h1 className="page-title">Developer Leaderboard</h1>
          <p className="text-slate-400 text-sm mt-1">
            Quality scores based on AI-detected issues across all PRs. Higher is better.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left: Leaderboard table */}
          <div className="lg:col-span-2 space-y-3">
            {loading ? (
              [...Array(5)].map((_, i) => (
                <div key={i} className="glass rounded-2xl p-5 animate-pulse h-20" />
              ))
            ) : error ? (
              <div className="glass rounded-2xl p-8 text-center text-red-400">{error}</div>
            ) : leaderboard.length === 0 ? (
              <div className="glass rounded-2xl p-12 text-center">
                <p className="text-4xl mb-4">🔍</p>
                <p className="text-slate-400 text-sm">No data yet. Complete a PR review to populate the leaderboard.</p>
              </div>
            ) : (
              leaderboard.map((dev, i) => (
                <div
                  key={dev.author}
                  id={`dev-row-${dev.author}`}
                  onMouseMove={handleMouseMove}
                  onMouseLeave={handleMouseLeave}
                  className="glass tilt-card rounded-2xl p-5 flex items-center gap-5 transition-all duration-300 hover:border-white/20"
                >
                  {/* Rank */}
                  <div className="text-2xl w-10 text-center shrink-0">{rankMedal(i)}</div>

                  {/* Score ring */}
                  <ScoreRing score={dev.score} />

                  {/* Author + breakdown */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white font-mono text-sm">@{dev.author}</p>
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      {dev.bug > 0 && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ color: SEVERITY.bug.color, background: SEVERITY.bug.bg }}>
                          {dev.bug} bug{dev.bug !== 1 ? 's' : ''}
                        </span>
                      )}
                      {dev.security > 0 && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ color: SEVERITY.security.color, background: SEVERITY.security.bg }}>
                          {dev.security} security
                        </span>
                      )}
                      {dev.performance > 0 && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ color: SEVERITY.performance.color, background: SEVERITY.performance.bg }}>
                          {dev.performance} perf
                        </span>
                      )}
                      {dev.style > 0 && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ color: SEVERITY.style.color, background: SEVERITY.style.bg }}>
                          {dev.style} style
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Radar mini-chart */}
                  <div className="hidden md:block shrink-0">
                    <DevRadar dev={dev} />
                  </div>

                  {/* Total */}
                  <div className="text-right shrink-0">
                    <p className="text-2xl font-bold text-white">{dev.total}</p>
                    <p className="text-xs text-slate-500">total issues</p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Right: AI weekly report */}
          <div>
            <WeeklyReportCard />
          </div>
        </div>
      </main>
    </div>
  );
}
