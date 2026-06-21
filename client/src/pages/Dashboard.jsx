import { useState, useMemo, useCallback, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, Cell,
} from 'recharts';
import { useReviews }   from '../hooks/useReviews.js';
import StatsBar         from '../components/StatsBar.jsx';
import RepoFilter       from '../components/RepoFilter.jsx';
import SeverityBadge, { SEVERITY } from '../components/SeverityBadge.jsx';
import api from '../lib/api.js';

const SEVERITIES = ['bug', 'security', 'performance', 'style', 'suggestion'];

// ── Chart tooltips ────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass px-3 py-2 rounded-xl text-xs text-white shadow-xl">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color ?? p.fill }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
}

// ── Re-run button (self-contained with per-row loading state) ─────────────────
function RerunButton({ reviewId, onDone }) {
  const [state, setState] = useState('idle'); // 'idle' | 'loading' | 'done' | 'error'

  async function handleRerun(e) {
    e.preventDefault(); // don't navigate to ReviewDetail
    e.stopPropagation();
    setState('loading');
    try {
      await api.post(`/reviews/${reviewId}/rerun`);
      setState('done');
      setTimeout(() => { setState('idle'); onDone?.(); }, 1500);
    } catch {
      setState('error');
      setTimeout(() => setState('idle'), 2000);
    }
  }

  const icons = {
    idle:    '↺',
    loading: '…',
    done:    '✓',
    error:   '✕',
  };
  const colors = {
    idle:    'text-slate-400 hover:text-brand-400',
    loading: 'text-brand-400 animate-spin',
    done:    'text-green-400',
    error:   'text-red-400',
  };

  return (
    <button
      id={`rerun-${reviewId}`}
      title="Re-run AI review"
      onClick={handleRerun}
      disabled={state === 'loading'}
      className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-bold
                  transition-all duration-200 hover:bg-white/10 shrink-0 ${colors[state]}`}
    >
      {icons[state]}
    </button>
  );
}

// ── Trend chart ───────────────────────────────────────────────────────────────
function TrendChart() {
  const [data, setData]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays]       = useState(30);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/reviews/stats/trend', { params: { days } });
      setData(res.data.data);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [days]);

  // Load on mount and when days changes
  useState(() => { load(); }, [load]);
  // Re-fetch when days changes — using useEffect equivalent
  useMemo(() => { load(); }, [days]);

  // Format date labels: "Jun 21"
  const formatDate = (d) => {
    const [, m, day] = d.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[parseInt(m) - 1]} ${parseInt(day)}`;
  };

  const TREND_LINES = [
    { key: 'bug',         color: SEVERITY.bug.color         },
    { key: 'security',    color: SEVERITY.security.color    },
    { key: 'performance', color: SEVERITY.performance.color },
    { key: 'suggestion',  color: SEVERITY.suggestion.color  },
  ];

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
          Severity Trend
        </h2>
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              id={`trend-days-${d}`}
              onClick={() => setDays(d)}
              className={`text-xs px-2.5 py-1 rounded-lg transition-all duration-150 ${
                days === d
                  ? 'bg-brand-500 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-white/10'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="h-48 flex items-center justify-center">
          <div className="text-slate-500 text-sm animate-pulse">Loading trend data…</div>
        </div>
      ) : data.length === 0 ? (
        <div className="h-48 flex items-center justify-center">
          <p className="text-slate-600 text-sm">No data yet — complete a PR review to populate this chart.</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data}>
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              formatter={(v) => (
                <span style={{ color: TREND_LINES.find((l) => l.key === v)?.color, fontSize: 11 }}>
                  {SEVERITY[v]?.label ?? v}
                </span>
              )}
            />
            {TREND_LINES.map(({ key, color }) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const [repoFilter, setRepoFilter]         = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  
  // Custom Tab State
  const [activeTab, setActiveTab] = useState('overview');
  
  // Custom Repo Connector Form State
  const [customRepoUrl, setCustomRepoUrl] = useState('');
  const [customPrNumber, setCustomPrNumber] = useState('');
  const [customPat, setCustomPat] = useState(() => localStorage.getItem('prism_pat') || '');
  const [triggerLoading, setTriggerLoading] = useState(false);
  const [triggerError, setTriggerError] = useState('');
  const [progressStep, setProgressStep] = useState(0);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [connectorTabMode, setConnectorTabMode] = useState('agent'); // 'agent' | 'pr' | 'webhook'

  const { reviews, stats, pagination, loading, error, setPage, refresh } = useReviews({
    repo:     repoFilter,
    severity: severityFilter,
  });

  const repos = useMemo(() => {
    const set = new Set(reviews.map((r) => r.repo));
    return [...set];
  }, [reviews]);

  // Issues-by-severity bar chart data
  const barData = useMemo(() => {
    if (!stats?.bySeverity) return [];
    return SEVERITIES.map((s) => ({
      name:  SEVERITY[s].label,
      count: stats.bySeverity[s] || 0,
      fill:  SEVERITY[s].color,
    }));
  }, [stats]);

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

  const handlePatChange = (e) => {
    const val = e.target.value;
    setCustomPat(val);
    localStorage.setItem('prism_pat', val);
  };

  const copyWebhookUrl = () => {
    const url = `${window.location.origin}/api/webhook/github`;
    navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const copyWebhookSecret = () => {
    navigator.clipboard.writeText('prism-dev-secret-2024');
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  const progressSteps = connectorTabMode === 'agent' ? [
    'Connecting to GitHub API & loading repository...',
    'Scanning repository tree & reading source code...',
    'Analyzing codebase health with Groq AI (Llama 3.3 70B)...',
    'Creating patch branch on your repository...',
    'Committing code corrections & automated bug fixes...',
    'Opening an automated Pull Request on GitHub...',
    'Finalizing audit dashboard entry...'
  ] : [
    'Validating inputs & GitHub API connectivity...',
    'Downloading changed file diff patches...',
    'Analyzing code quality using Groq SDK (Llama 3.3 70B)...',
    'Generating review comments and suggested fixes...',
    'Publishing inline comments and summary back to PR...',
    'Finalizing data persistence to your dashboard...'
  ];

  async function handleTriggerReview(e) {
    e.preventDefault();
    setTriggerError('');
    setTriggerLoading(true);
    setProgressStep(0);

    const steps = connectorTabMode === 'agent' ? 7 : 6;

    const interval = setInterval(() => {
      setProgressStep((prev) => {
        if (prev < steps - 2) {
          return prev + 1;
        }
        return prev;
      });
    }, 2000);

    try {
      const endpoint = connectorTabMode === 'agent' ? '/reviews/audit-repo' : '/reviews/run-custom';
      const payload = connectorTabMode === 'agent'
        ? { repoUrl: customRepoUrl, githubToken: customPat }
        : { repoUrl: customRepoUrl, prNumber: customPrNumber, githubToken: customPat };

      const res = await api.post(endpoint, payload);

      clearInterval(interval);
      setProgressStep(steps - 1);
      setTimeout(() => {
        setTriggerLoading(false);
        refresh();
        navigate(`/reviews/${res.data.data._id}`);
      }, 1000);
    } catch (err) {
      clearInterval(interval);
      setTriggerLoading(false);
      setTriggerError(err.response?.data?.error || 'Execution failed. Please verify repo accessibility and token permissions.');
    }
  }

  function logout() {
    localStorage.removeItem('token');
    navigate('/login');
  }

  const webhookUrl = `${window.location.origin}/api/webhook/github`;
  const webhookSecret = 'prism-dev-secret-2024';

  return (
    <div className="min-h-screen animated-bg">
      <div className="fixed top-0 right-0 w-[600px] h-[400px] bg-brand-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-0 left-0 w-[400px] h-[400px] bg-purple-800/10 rounded-full blur-3xl pointer-events-none" />

      {/* ── Navbar ──────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-surface-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">💎</span>
            <span className="font-bold text-white text-lg tracking-wider">PrismFlow</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/leaderboard" id="leaderboard-nav-btn" className="btn-ghost text-sm">
              🏆 Leaderboard
            </Link>
            <button id="refresh-btn" onClick={refresh} className="btn-ghost text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
            <button id="logout-btn" onClick={logout} className="btn-ghost text-red-400 hover:text-red-300 text-sm">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6 animate-fade-in">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="page-title">Review Dashboard</h1>
            <p className="text-slate-400 text-sm mt-1">PrismFlow — Break every pull request into its true colors</p>
          </div>

          {/* Tab Control */}
          <div className="flex bg-white/5 p-1 rounded-xl border border-white/10 self-start md:self-auto shadow-inner">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all duration-200 ${
                activeTab === 'overview'
                  ? 'bg-brand-500 text-white shadow-glow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              📊 Overview
            </button>
            <button
              id="connect-repo-tab"
              onClick={() => setActiveTab('connect')}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all duration-200 ${
                activeTab === 'connect'
                  ? 'bg-brand-500 text-white shadow-glow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              🔌 Connect Repository
            </button>
          </div>
        </div>

        {activeTab === 'overview' ? (
          <div className="space-y-8 animate-fade-in">
            {/* ── Stats bar ─────────────────────────────────────────────────────── */}
            <StatsBar stats={stats} loading={loading} />

            {/* ── Charts row ────────────────────────────────────────────────────── */}
            <div className="grid lg:grid-cols-3 gap-6">
              {/* Issues by severity bar */}
              <div
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                className="glass tilt-card rounded-2xl p-6 lg:col-span-2"
              >
                <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">
                  Issues by Severity
                </h2>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={barData} barSize={36}>
                    <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                    <Bar dataKey="count" name="Issues" radius={[6, 6, 0, 0]}>
                      {barData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} fillOpacity={0.85} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Top repos */}
              <div
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                className="glass tilt-card rounded-2xl p-6"
              >
                <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">
                  Top Repositories
                </h2>
                {stats?.topRepos?.length ? (
                  <ul className="space-y-3">
                    {stats.topRepos.map((r, i) => (
                      <li key={r._id} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-slate-500 text-sm w-5">{i + 1}.</span>
                          <span className="text-sm text-slate-300 truncate font-mono">{r._id}</span>
                        </div>
                        <span className="text-xs font-semibold text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded-full whitespace-nowrap">
                          {r.count} issue{r.count !== 1 ? 's' : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-slate-500 text-sm">No data yet</p>
                )}
              </div>
            </div>

            {/* ── Severity trend chart (full-width) ─────────────────────────────── */}
            <TrendChart />

            {/* ── Filters ───────────────────────────────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-4">
              <RepoFilter value={repoFilter} onChange={(v) => { setRepoFilter(v); setPage(1); }} repos={repos} />
              <div className="flex items-center gap-2">
                <label htmlFor="severity-filter" className="text-sm text-slate-400 whitespace-nowrap">Severity</label>
                <select
                  id="severity-filter"
                  value={severityFilter}
                  onChange={(e) => { setSeverityFilter(e.target.value); setPage(1); }}
                  className="input py-2 text-sm min-w-[160px] cursor-pointer"
                >
                  <option value="">All Severities</option>
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>{SEVERITY[s].label}</option>
                  ))}
                </select>
              </div>
              {(repoFilter || severityFilter) && (
                <button id="clear-filters-btn" onClick={() => { setRepoFilter(''); setSeverityFilter(''); setPage(1); }} className="btn-ghost text-xs">
                  ✕ Clear filters
                </button>
              )}
            </div>

            {/* ── Review list ───────────────────────────────────────────────────── */}
            {error ? (
              <div className="glass rounded-2xl p-8 text-center text-red-400">{error}</div>
            ) : loading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="glass rounded-2xl p-5 animate-pulse">
                    <div className="h-4 bg-white/10 rounded w-1/3 mb-2" />
                    <div className="h-3 bg-white/10 rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : reviews.length === 0 ? (
              <div className="glass rounded-2xl p-12 text-center">
                <p className="text-4xl mb-4">🔍</p>
                <p className="text-slate-400">No reviews found. Open a pull request to trigger your first review.</p>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {reviews.map((review) => (
                    <div key={review._id} className="glass-hover rounded-2xl flex items-center gap-3 pr-2">
                      <Link
                        to={`/reviews/${review._id}`}
                        id={`review-${review._id}`}
                        className="flex items-start justify-between gap-4 p-5 flex-1 min-w-0"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-xs text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded-md">
                              #{review.prNumber}
                            </span>
                            <span
                              className="text-xs px-2 py-0.5 rounded-full font-medium"
                              style={{
                                color: review.status === 'completed' ? '#4ade80' :
                                       review.status === 'failed'    ? '#f87171' : '#fbbf24',
                                background: review.status === 'completed' ? 'rgba(74,222,128,0.1)' :
                                            review.status === 'failed'    ? 'rgba(248,113,113,0.1)' : 'rgba(251,191,36,0.1)',
                              }}
                            >
                              {review.status}
                            </span>
                          </div>
                          <p className="font-semibold text-white truncate">
                            {review.prTitle || `PR #${review.prNumber}`}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5 font-mono">{review.repo}</p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {['bug', 'security', 'performance'].map((sev) => {
                            const count = review.comments?.filter((c) => c.severity === sev).length;
                            if (!count) return null;
                            return (
                              <span
                                key={sev}
                                className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                                style={{ color: SEVERITY[sev].color, background: SEVERITY[sev].bg }}
                              >
                                {count} {sev}
                              </span>
                            );
                          })}
                          <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </Link>
                      <RerunButton reviewId={review._id} onDone={refresh} />
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {pagination.totalPages > 1 && (
                  <div className="flex items-center justify-center gap-3">
                    <button
                      id="prev-page-btn"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={pagination.page === 1}
                      className="btn-ghost disabled:opacity-40"
                    >
                      ← Prev
                    </button>
                    <span className="text-sm text-slate-400">
                      Page {pagination.page} of {pagination.totalPages}
                    </span>
                    <button
                      id="next-page-btn"
                      onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                      disabled={pagination.page === pagination.totalPages}
                      className="btn-ghost disabled:opacity-40"
                    >
                      Next →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          /* Connect Repository Tab Content */
          <div className="grid lg:grid-cols-2 gap-8 items-start animate-fade-in">
            {/* Left Column: Connection Modes */}
            <div className="space-y-6">
              <div
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                className="glass tilt-card rounded-2xl p-6 space-y-4"
              >
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    🔌 Integration Mode
                  </h2>
                  <p className="text-slate-400 text-sm mt-1">Choose how you want to connect PrismFlow to your codebase.</p>
                </div>

                <div className="space-y-3 pt-2">
                  {/* Mode 1: Autonomous Agent */}
                  <button
                    type="button"
                    onClick={() => {
                      setConnectorTabMode('agent');
                      setTriggerError('');
                    }}
                    className={`w-full text-left p-4 rounded-xl border transition-all duration-200 ${
                      connectorTabMode === 'agent'
                        ? 'bg-brand-500/10 border-brand-500/50 shadow-glow'
                        : 'bg-white/5 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">🤖</span>
                      <h3 className="text-sm font-semibold text-white">Autonomous Codebase Agent</h3>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Scan default branch, find security risks or bugs, auto-commit code corrections, and open a PR on GitHub.
                    </p>
                  </button>

                  {/* Mode 2: Trigger PR Review */}
                  <button
                    type="button"
                    onClick={() => {
                      setConnectorTabMode('pr');
                      setTriggerError('');
                    }}
                    className={`w-full text-left p-4 rounded-xl border transition-all duration-200 ${
                      connectorTabMode === 'pr'
                        ? 'bg-brand-500/10 border-brand-500/50 shadow-glow'
                        : 'bg-white/5 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">🔍</span>
                      <h3 className="text-sm font-semibold text-white">Pull Request Reviewer</h3>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Analyze a specific open Pull Request on-demand. Posts inline comments and a summary review directly to GitHub.
                    </p>
                  </button>

                  {/* Mode 3: CI/CD Webhook */}
                  <button
                    type="button"
                    onClick={() => {
                      setConnectorTabMode('webhook');
                      setTriggerError('');
                    }}
                    className={`w-full text-left p-4 rounded-xl border transition-all duration-200 ${
                      connectorTabMode === 'webhook'
                        ? 'bg-brand-500/10 border-brand-500/50 shadow-glow'
                        : 'bg-white/5 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">⚙️</span>
                      <h3 className="text-sm font-semibold text-white">CI/CD Webhook Integration</h3>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Configure automatic triggers on GitHub to run PrismFlow reviews on every pull request push or update.
                    </p>
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column: Terminal form / Webhook guide */}
            {connectorTabMode === 'webhook' ? (
              <div
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                className="glass tilt-card rounded-2xl p-6 space-y-6"
              >
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    ⚙️ Webhook Setup Guide
                  </h2>
                  <p className="text-slate-400 text-sm mt-1">Configure GitHub to trigger PrismFlow on every Pull Request update.</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Payload URL</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value={webhookUrl}
                        className="input py-2 text-sm bg-black/30 font-mono text-slate-300 flex-1 select-all"
                      />
                      <button
                        onClick={copyWebhookUrl}
                        className="px-4 py-2 bg-brand-500/20 border border-brand-500/30 rounded-xl text-xs font-bold text-brand-300 hover:bg-brand-500 hover:text-white transition-all active:scale-95"
                      >
                        {copiedUrl ? 'Copied! ✓' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                      <span>Secret Key</span>
                      <button
                        type="button"
                        onClick={() => setShowSecret(!showSecret)}
                        className="text-[10px] text-brand-400 hover:text-brand-300 transition-all font-semibold lowercase"
                      >
                        {showSecret ? 'hide' : 'show'}
                      </button>
                    </label>
                    <div className="flex gap-2">
                      <input
                        type={showSecret ? 'text' : 'password'}
                        readOnly
                        value={webhookSecret}
                        className="input py-2 text-sm bg-black/30 font-mono text-slate-300 flex-1 select-all"
                      />
                      <button
                        onClick={copyWebhookSecret}
                        className="px-4 py-2 bg-brand-500/20 border border-brand-500/30 rounded-xl text-xs font-bold text-brand-300 hover:bg-brand-500 hover:text-white transition-all active:scale-95"
                      >
                        {copiedSecret ? 'Copied! ✓' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3 pt-2">
                    <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Quick Config Checklist:</h3>
                    <ul className="space-y-2 text-sm text-slate-400">
                      <li className="flex items-start gap-2">
                        <span className="text-brand-400 mt-0.5">✔</span>
                        <span>Set <strong>Content type</strong> to <code>application/json</code>.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-brand-400 mt-0.5">✔</span>
                        <span>Under events, select <strong>Let me select individual events</strong> and check only <strong>Pull requests</strong>.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-brand-400 mt-0.5">✔</span>
                        <span>Check <strong>Active</strong> and click <strong>Add webhook</strong>.</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            ) : (
              <div
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                className="glass tilt-card rounded-2xl p-6 space-y-6"
              >
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    {connectorTabMode === 'agent' ? '🤖 Autonomous Codebase Agent' : '🚀 Trigger Instant AI Review'}
                  </h2>
                  <p className="text-slate-400 text-sm mt-1">
                    {connectorTabMode === 'agent' 
                      ? 'Find bugs/vulnerabilities, commit patches, and open a Pull Request automatically.'
                      : 'Run PrismFlow immediately on any public or private Pull Request.'}
                  </p>
                </div>

                {triggerError && (
                  <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                    {triggerError}
                  </div>
                )}

                {triggerLoading ? (
                  <div className="space-y-4 py-4">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <div className="relative w-16 h-16">
                        <div className="absolute inset-0 rounded-full border-4 border-brand-500/10" />
                        <div className="absolute inset-0 rounded-full border-4 border-t-brand-500 border-r-purple-500 animate-spin" />
                      </div>
                      <p className="text-sm text-slate-300 font-semibold mt-2">
                        {connectorTabMode === 'agent' ? 'Running Autonomous Agent...' : 'Running AI Review Pipeline...'}
                      </p>
                    </div>

                    <div className="space-y-2 border-t border-white/5 pt-4 max-w-sm mx-auto">
                      {progressSteps.map((step, idx) => {
                        const isCompleted = progressStep > idx;
                        const isActive = progressStep === idx;
                        return (
                          <div key={idx} className="flex items-start gap-3 text-xs">
                            <span className={`font-bold ${isCompleted ? 'text-green-400' : isActive ? 'text-brand-400' : 'text-slate-600'}`}>
                              {isCompleted ? '✓' : isActive ? '●' : '○'}
                            </span>
                            <span className={isCompleted ? 'text-slate-400 line-through' : isActive ? 'text-white font-semibold' : 'text-slate-500'}>
                              {step}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleTriggerReview} className="space-y-4">
                    <div>
                      <label htmlFor="repoUrl" className="block text-sm font-medium text-slate-300 mb-1.5">
                        Repository URL or owner/repo
                      </label>
                      <input
                        id="repoUrl"
                        type="text"
                        required
                        placeholder="https://github.com/facebook/react or facebook/react"
                        value={customRepoUrl}
                        onChange={(e) => setCustomRepoUrl(e.target.value)}
                        className="input text-sm"
                      />
                    </div>

                    {connectorTabMode === 'pr' && (
                      <div>
                        <label htmlFor="prNumber" className="block text-sm font-medium text-slate-300 mb-1.5">
                          Pull Request Number
                        </label>
                        <input
                          id="prNumber"
                          type="number"
                          required
                          placeholder="e.g. 24"
                          value={customPrNumber}
                          onChange={(e) => setCustomPrNumber(e.target.value)}
                          className="input text-sm"
                        />
                      </div>
                    )}

                    <div>
                      <label htmlFor="customPat" className="block text-sm font-medium text-slate-300 mb-1.5 flex items-center justify-between">
                        <span>GitHub Personal Access Token (PAT)</span>
                        <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                          {connectorTabMode === 'agent' ? 'Required' : 'Optional'}
                        </span>
                      </label>
                      <input
                        id="customPat"
                        type="password"
                        required={connectorTabMode === 'agent'}
                        placeholder="ghp_..."
                        value={customPat}
                        onChange={handlePatChange}
                        className="input text-sm font-mono"
                      />
                      <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">
                        {connectorTabMode === 'agent'
                          ? '* Requires repo permissions to create branches, push code fixes, and open a Pull Request.'
                          : '* Required for private repositories. Stored strictly in your local browser session and never sent to our database.'}
                      </p>
                    </div>

                    <button
                      type="submit"
                      disabled={triggerLoading}
                      className="btn-primary w-full justify-center mt-6 text-sm font-bold bg-gradient-to-r from-brand-500 via-brand-600 to-purple-600 hover:from-brand-400 hover:to-purple-500 shadow-glow animate-pulse hover:animate-none"
                    >
                      {connectorTabMode === 'agent' ? '🤖 Run Codebase Audit & Auto-Fix' : '🚀 Trigger Instant AI Review'}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
