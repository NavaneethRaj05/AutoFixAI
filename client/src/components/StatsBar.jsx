/**
 * StatsBar — 4 stat cards displayed horizontally.
 * Props: { totalReviews, bySeverity, topRepo }
 */
export default function StatsBar({ stats, loading }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="glass rounded-2xl p-5 animate-pulse">
            <div className="h-3 bg-white/10 rounded w-20 mb-3" />
            <div className="h-8 bg-white/10 rounded w-12" />
          </div>
        ))}
      </div>
    );
  }

  const cards = [
    {
      label:  'Total Reviews',
      value:  stats?.totalReviews ?? 0,
      icon:   '📋',
      color:  '#6366f1',
      glow:   'rgba(99,102,241,0.2)',
    },
    {
      label:  'Bugs Found',
      value:  stats?.bySeverity?.bug ?? 0,
      icon:   '🐛',
      color:  '#F87171',
      glow:   'rgba(248,113,113,0.2)',
    },
    {
      label:  'Security Issues',
      value:  stats?.bySeverity?.security ?? 0,
      icon:   '🔐',
      color:  '#FB923C',
      glow:   'rgba(251,146,60,0.2)',
    },
    {
      label:  'Performance',
      value:  stats?.bySeverity?.performance ?? 0,
      icon:   '⚡',
      color:  '#FBBF24',
      glow:   'rgba(251,191,36,0.2)',
    },
  ];

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
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="glass tilt-card rounded-2xl p-5"
          style={{ boxShadow: `0px 10px 20px -5px rgba(0, 0, 0, 0.4), 0 0 20px ${card.glow}` }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              {card.label}
            </span>
            <span className="text-xl">{card.icon}</span>
          </div>
          <p className="text-3xl font-bold" style={{ color: card.color }}>
            {card.value.toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  );
}
