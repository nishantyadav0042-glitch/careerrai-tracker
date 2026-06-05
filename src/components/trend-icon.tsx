export function TrendIcon({ trend, invert = false }: { trend: 'up' | 'down' | 'stable'; invert?: boolean }) {
  const good = invert ? trend === 'down' : trend === 'up';
  const bad = invert ? trend === 'up' : trend === 'down';
  if (good) return <span className="text-emerald-600 text-sm">↑</span>;
  if (bad) return <span className="text-rose-600 text-sm">↓</span>;
  return <span className="text-stone-500 text-sm">→</span>;
}
