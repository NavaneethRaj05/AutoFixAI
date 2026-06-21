import SeverityBadge, { SEVERITY } from './SeverityBadge.jsx';

/**
 * CommentCard — displays a single AI review comment.
 * Shows severity badge, file path, line number, and the comment text.
 */
export default function CommentCard({ comment, animated = false }) {
  const { path, line, severity, comment: text } = comment;
  const config = SEVERITY[severity] || SEVERITY.suggestion;

  return (
    <div
      className={`glass rounded-xl overflow-hidden transition-all duration-300 hover:border-white/20 ${
        animated ? 'animate-slide-up' : ''
      }`}
      style={{ borderLeft: `3px solid ${config.color}` }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 px-4 pt-4 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <SeverityBadge severity={severity} />
          <span className="text-slate-400 text-xs">Line {line}</span>
        </div>
        {/* File path */}
        <span
          className="font-mono text-xs text-slate-400 bg-black/30 px-2.5 py-1 rounded-lg truncate max-w-xs"
          title={path}
        >
          {path}
        </span>
      </div>

      {/* Comment text */}
      <p className="px-4 pb-3 text-sm text-slate-300 leading-relaxed">
        {text}
      </p>

      {/* Suggested fix (bug/security only) — mirrors GitHub suggestion block */}
      {comment.suggestedFix && ['bug', 'security'].includes(severity) && (
        <div className="mx-4 mb-4 rounded-xl overflow-hidden border border-green-500/20">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border-b border-green-500/20">
            <span className="text-green-400 text-xs font-semibold">💡 Suggested Fix</span>
            <span className="text-slate-500 text-xs">(one-click applicable on GitHub)</span>
          </div>
          <pre className="code-block rounded-none border-0 text-green-300 text-xs overflow-x-auto">
            <code>{comment.suggestedFix}</code>
          </pre>
        </div>
      )}
    </div>
  );
}
