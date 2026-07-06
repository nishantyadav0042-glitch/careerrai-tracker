import Link from 'next/link';
import { Card } from '@/components/ui/card';

interface WindowStats {
  daysStudied: number;
  tasksCompleted: number;
  minutesStudied: number;
  topicsTouched: number;
  confidenceCounts: { green: number; yellow: number; red: number };
  mocksLogged: number;
}

interface StudyPlanSnapshotProps {
  coverageTally: { not_started: number; started: number; completed: number; strong: number };
  last30: WindowStats;
  weeklyEvolution: string[];
}

// The Study Plan Dashboard, condensed for the homepage — Coverage,
// Preparation Memory, and Weekly Evolution all otherwise only lived on the
// separate /student/blueprint page, one click away from where a student
// actually opens the app every day. This surfaces the headline numbers
// right here; the full breakdown (and the Coverage Matrix's own edit
// screen) stays one tap away rather than duplicating it in full.
export function StudyPlanSnapshot({ coverageTally, last30, weeklyEvolution }: StudyPlanSnapshotProps) {
  const coverageTotal = coverageTally.not_started + coverageTally.started + coverageTally.completed + coverageTally.strong;
  const hasMemory = last30.tasksCompleted > 0;
  const topEvolutionLine = weeklyEvolution[0] ?? null;

  // Nothing real to show yet (brand-new student, no Coverage Matrix and no
  // history) — omit the whole card rather than render an empty shell.
  if (coverageTotal === 0 && !hasMemory) return null;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold">Your Study Plan</p>
        <Link href="/student/blueprint" className="text-xs font-semibold text-orange-600 hover:text-orange-700">Full blueprint →</Link>
      </div>

      {coverageTotal > 0 && (
        <div className="grid grid-cols-4 gap-2 text-center mb-3">
          {([
            ['Never started', coverageTally.not_started, 'text-stone-400'],
            ['Started', coverageTally.started, 'text-amber-600'],
            ['Completed', coverageTally.completed, 'text-teal-600'],
            ['Strong', coverageTally.strong, 'text-orange-600'],
          ] as const).map(([label, count, color]) => (
            <div key={label}>
              <p className={`text-lg font-bold ${color}`}>{count}</p>
              <p className="text-[10px] text-stone-400 leading-tight mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {hasMemory && (
        <div className={`flex items-center justify-between text-xs text-stone-600 ${coverageTotal > 0 ? 'border-t border-stone-100 pt-3' : ''}`}>
          <span><strong className="text-stone-900">{last30.daysStudied}</strong> days studied · <strong className="text-stone-900">{Math.round(last30.minutesStudied / 6) / 10}h</strong> last 30d</span>
          {(last30.confidenceCounts.green + last30.confidenceCounts.yellow + last30.confidenceCounts.red) > 0 && (
            <span className="shrink-0 ml-2">🟢{last30.confidenceCounts.green} 🟡{last30.confidenceCounts.yellow} 🔴{last30.confidenceCounts.red}</span>
          )}
        </div>
      )}

      {topEvolutionLine && (
        <p className="text-xs text-stone-600 border-t border-stone-100 mt-3 pt-3">
          <span className="font-semibold text-stone-500">This week: </span>{topEvolutionLine}
        </p>
      )}
    </Card>
  );
}
