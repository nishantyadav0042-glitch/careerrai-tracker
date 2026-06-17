'use client';

const CAT_DATE = new Date(2026, 10, 29);

interface TrajectoryWallProps {
  dreamCollege: string | null;
  currentPercentile: number | null;
  targetPercentile: number;
  logCount: number;
  mockCount: number;
  daysStudied: number;
}

export function TrajectoryWall({
  dreamCollege,
  currentPercentile,
  targetPercentile,
  logCount,
  mockCount,
}: TrajectoryWallProps) {
  if (!dreamCollege) return null;

  const daysToCat = Math.max(
    0,
    // eslint-disable-next-line react-hooks/purity
    Math.ceil((CAT_DATE.getTime() - Date.now()) / 86_400_000)
  );

  const pctNow = currentPercentile ?? 50;
  const gap = Math.max(0, targetPercentile - pctNow);
  const progress = Math.min(100, Math.round((pctNow / targetPercentile) * 100));

  // Trajectory sentence — daysToCat is already visible in the top-right chip,
  // so don't repeat it in the text.
  let trajectory = '';
  if (logCount === 0) {
    trajectory = 'Log day 1 to start your trajectory.';
  } else if (gap === 0) {
    trajectory = `You're at your target. Time to raise the bar.`;
  } else if (mockCount > 0) {
    const ratePerDay = gap / Math.max(daysToCat, 1);
    if (ratePerDay < 0.05) {
      trajectory = `At current pace, you reach ${targetPercentile}%ile well before the exam.`;
    } else {
      trajectory = `${gap} percentile points to close — ${mockCount} mocks in the bank.`;
    }
  } else {
    trajectory = `${gap} percentile points between here and ${dreamCollege.split(' ')[1] || dreamCollege}.`;
  }

  return (
    <div className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-white px-4 py-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-orange-600">
            Road to {dreamCollege}
          </p>
          <p className="text-xs text-stone-600 mt-0.5">{trajectory}</p>
        </div>
        <div className="text-right shrink-0 ml-3">
          <p className="text-xl font-bold text-stone-900">{daysToCat}d</p>
          <p className="text-[10px] text-stone-400">to CAT</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] text-stone-500">
          <span>{pctNow}%ile now</span>
          <span>{targetPercentile}%ile goal</span>
        </div>
        <div className="h-2 bg-stone-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-orange-400 to-orange-600 rounded-full transition-all duration-700"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
