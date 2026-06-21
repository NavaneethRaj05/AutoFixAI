// Canonical severity config — import this everywhere for consistent styling
export const SEVERITY = {
  bug: {
    color:  '#F87171',
    bg:     'rgba(239,68,68,0.15)',
    border: 'rgba(239,68,68,0.3)',
    label:  'Bug',
    icon:   '🐛',
  },
  security: {
    color:  '#FB923C',
    bg:     'rgba(249,115,22,0.15)',
    border: 'rgba(249,115,22,0.3)',
    label:  'Security',
    icon:   '🔐',
  },
  performance: {
    color:  '#FBBF24',
    bg:     'rgba(245,158,11,0.15)',
    border: 'rgba(245,158,11,0.3)',
    label:  'Performance',
    icon:   '⚡',
  },
  style: {
    color:  '#60A5FA',
    bg:     'rgba(96,165,250,0.15)',
    border: 'rgba(96,165,250,0.3)',
    label:  'Style',
    icon:   '✨',
  },
  suggestion: {
    color:  '#A78BFA',
    bg:     'rgba(167,139,250,0.15)',
    border: 'rgba(167,139,250,0.3)',
    label:  'Suggestion',
    icon:   '💡',
  },
};

/**
 * SeverityBadge — colored pill with icon and label.
 */
export default function SeverityBadge({ severity, size = 'md' }) {
  const config = SEVERITY[severity] || SEVERITY.suggestion;
  const sizeClasses = size === 'sm'
    ? 'text-[10px] px-2 py-0.5 gap-1'
    : 'text-xs px-2.5 py-1 gap-1.5';

  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold ${sizeClasses}`}
      style={{
        color:           config.color,
        backgroundColor: config.bg,
        border:          `1px solid ${config.border}`,
      }}
    >
      <span>{config.icon}</span>
      {config.label}
    </span>
  );
}
