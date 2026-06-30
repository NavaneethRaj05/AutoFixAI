import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../lib/api.js';
import CommentCard  from '../components/CommentCard.jsx';
import SeverityBadge, { SEVERITY } from '../components/SeverityBadge.jsx';

const SEVERITIES = ['bug', 'security', 'performance', 'style', 'suggestion'];

export default function ReviewDetail() {
  const { id } = useParams();
  const [review, setReview]       = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [rerunState, setRerunState]     = useState('idle'); // 'idle'|'loading'|'done'|'error'

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await api.get(`/reviews/${id}`);
        setReview(res.data.data);
      } catch (err) {
        const errorData = err.response?.data?.error || err.response?.data;
        const errorMsg = typeof errorData === 'object'
          ? (errorData.message || errorData.error || JSON.stringify(errorData))
          : (errorData || err.message || 'Failed to load review');
        setError(errorMsg);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function handleRerun() {
    setRerunState('loading');
    try {
      await api.post(`/reviews/${id}/rerun`);
      // Optimistically flip status so the badge updates immediately
      setReview((prev) => prev ? { ...prev, status: 'pending' } : prev);
      setRerunState('done');
      setTimeout(() => setRerunState('idle'), 2000);
    } catch {
      setRerunState('error');
      setTimeout(() => setRerunState('idle'), 2000);
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

  if (loading) {
    return (
      <div className="min-h-screen animated-bg flex items-center justify-center">
        <div className="text-center animate-pulse">
          <p className="text-4xl mb-4">🤖</p>
          <p className="text-slate-400">Loading review…</p>
        </div>
      </div>
    );
  }

  if (error || !review) {
    return (
      <div className="min-h-screen animated-bg flex items-center justify-center">
        <div className="glass rounded-2xl p-8 text-center">
          <p className="text-4xl mb-4">❌</p>
          <p className="text-red-400">{error || 'Review not found'}</p>
          <Link to="/" className="btn-primary mt-4 inline-flex">← Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  // Filter comments by severity
  const filteredComments = activeFilter === 'all'
    ? review.comments
    : review.comments.filter((c) => c.severity === activeFilter);

  // Severity counts for filter tabs
  const counts = {};
  for (const sev of SEVERITIES) {
    counts[sev] = review.comments.filter((c) => c.severity === sev).length;
  }

  // Group filtered comments by file path
  const byFile = filteredComments.reduce((acc, c) => {
    if (!acc[c.path]) acc[c.path] = [];
    acc[c.path].push(c);
    return acc;
  }, {});

  return (
    <div className="min-h-screen animated-bg">
      {/* Decorative orbs */}
      <div className="fixed top-0 right-0 w-[500px] h-[400px] bg-brand-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* ── Navbar ───────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-surface-950/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center gap-4">
          <Link to="/" id="back-to-dashboard" className="btn-ghost text-sm">
            ← Dashboard
          </Link>
          <div className="h-5 w-px bg-white/20" />
          <span className="text-sm text-slate-400 truncate">
            {review.repo} <span className="text-brand-400 font-mono">#{review.prNumber}</span>
          </span>

          {/* Re-run button */}
          <div className="ml-auto">
            <button
              id="rerun-btn"
              onClick={handleRerun}
              disabled={rerunState === 'loading'}
              className={`btn-ghost text-sm gap-2 ${
                rerunState === 'done'  ? 'text-green-400' :
                rerunState === 'error' ? 'text-red-400'   : ''
              }`}
            >
              <span className={rerunState === 'loading' ? 'inline-block animate-spin' : ''}>↺</span>
              {rerunState === 'idle'    && 'Re-run Review'}
              {rerunState === 'loading' && 'Triggering…'}
              {rerunState === 'done'    && 'Re-run triggered!'}
              {rerunState === 'error'   && 'Failed — retry?'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6 animate-fade-in">
        {/* ── PR header ────────────────────────────────────────────────────── */}
        <div
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="glass tilt-card rounded-2xl p-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-white mb-1">
                {review.prTitle || `Pull Request #${review.prNumber}`}
              </h1>
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
                <span className="font-mono">{review.repo}</span>
                <span>·</span>
                <span>by <span className="text-slate-300">@{review.author}</span></span>
                <span>·</span>
                <span className="font-mono text-xs text-slate-500 truncate max-w-xs">{review.headSha}</span>
              </div>
            </div>

            {/* Status badge */}
            <span
              className="text-xs px-3 py-1 rounded-full font-semibold"
              style={{
                color: review.status === 'completed' ? '#4ade80' :
                       review.status === 'failed'    ? '#f87171' : '#fbbf24',
                background: review.status === 'completed' ? 'rgba(74,222,128,0.15)' :
                            review.status === 'failed'    ? 'rgba(248,113,113,0.15)' : 'rgba(251,191,36,0.15)',
              }}
            >
              {review.status.toUpperCase()}
            </span>
          </div>

          {/* Summary chips */}
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-white/10">
            <span className="text-xs text-slate-400 self-center">
              {review.comments.length} issue{review.comments.length !== 1 ? 's' : ''} found
            </span>
            {SEVERITIES.filter((s) => counts[s] > 0).map((s) => (
              <SeverityBadge key={s} severity={s} />
            ))}
          </div>
        </div>

        {/* ── AI Summary card ───────────────────────────────────────────────── */}
        {review.summary && (
          <div
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            className="glass tilt-card rounded-2xl overflow-hidden animate-slide-up"
          >
            {/* Verdict header */}
            {(() => {
              const verdictConfig = {
                APPROVE:          { label: '✅ APPROVE',          bg: 'rgba(74,222,128,0.12)', border: 'rgba(74,222,128,0.3)',  text: '#4ade80' },
                REQUEST_CHANGES:  { label: '🔄 REQUEST CHANGES',  bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.3)',  text: '#fbbf24' },
                CRITICAL_ISSUES:  { label: '🚨 CRITICAL ISSUES',  bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.3)', text: '#f87171' },
              }[review.verdict] ?? { label: '💬 REVIEWED', bg: 'rgba(99,102,241,0.12)', border: 'rgba(99,102,241,0.3)', text: '#818cf8' };

              const riskConfig = {
                low:      { label: '🟢 Low',      color: '#4ade80' },
                medium:   { label: '🟡 Medium',   color: '#fbbf24' },
                high:     { label: '🟠 High',     color: '#fb923c' },
                critical: { label: '🔴 Critical', color: '#f87171' },
              }[review.riskLevel] ?? { label: '⚪ Unknown', color: '#94a3b8' };

              return (
                <>
                  <div className="px-5 py-3 flex items-center justify-between"
                    style={{ background: verdictConfig.bg, borderBottom: `1px solid ${verdictConfig.border}` }}>
                    <span className="font-bold text-sm" style={{ color: verdictConfig.text }}>
                      {verdictConfig.label}
                    </span>
                    <span className="text-xs font-medium" style={{ color: riskConfig.color }}>
                      Risk: {riskConfig.label}
                    </span>
                  </div>
                  <div className="px-5 py-4">
                    <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">AI Summary</h2>
                    <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                      {review.summary}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* ── Severity filter tabs ─────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2">
          <button
            id="filter-all"
            onClick={() => setActiveFilter('all')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
              activeFilter === 'all'
                ? 'bg-brand-500 text-white'
                : 'text-slate-400 hover:text-white hover:bg-white/10'
            }`}
          >
            All ({review.comments.length})
          </button>
          {SEVERITIES.filter((s) => counts[s] > 0).map((s) => (
            <button
              key={s}
              id={`filter-${s}`}
              onClick={() => setActiveFilter(s)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                activeFilter === s ? 'ring-1' : 'hover:bg-white/10'
              }`}
              style={
                activeFilter === s
                  ? { color: SEVERITY[s].color, background: SEVERITY[s].bg, ringColor: SEVERITY[s].color }
                  : { color: SEVERITY[s].color }
              }
            >
              {SEVERITY[s].icon} {SEVERITY[s].label} ({counts[s]})
            </button>
          ))}
        </div>

        {/* ── Comments grouped by file ─────────────────────────────────────── */}
        {filteredComments.length === 0 ? (
          <div className="glass rounded-2xl p-12 text-center text-slate-500">
            No issues for this filter.
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(byFile).map(([filePath, comments]) => (
              <div key={filePath} className="space-y-3">
                {/* File header */}
                <div className="flex items-center gap-3">
                  <span className="text-slate-400">📄</span>
                  <code className="text-sm font-mono text-slate-300 bg-white/5 px-3 py-1 rounded-lg">
                    {filePath}
                  </code>
                  <span className="text-xs text-slate-500">{comments.length} issue{comments.length !== 1 ? 's' : ''}</span>
                </div>

                {comments.map((comment, idx) => (
                  <CommentCard
                    key={`${filePath}-${idx}`}
                    comment={comment}
                    animated
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
