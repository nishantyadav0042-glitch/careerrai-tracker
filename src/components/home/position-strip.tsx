import { Flame, Shield } from 'lucide-react';
import { TONE } from '@/lib/pace-tone';
import type { PaceResult } from '@/lib/study-pace';

interface PositionStripProps {
  streak: number;
  shields: number;
  pace: PaceResult;
  targetIso: string;
  /** Hours already logged today — read from the SAME hoursByDate map the rest
   *  of Home builds from `daily_reports`, never recomputed. */
  todayHours: number;
}

function fmt(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}

// S3 — the "Position" block, consolidated (13 Aug). Founder's mock showed one
// dark strip carrying streak + syllabus date + coverage% + hours-today; Home
// already had all four numbers, just split across a separate white streak
// pill and PaceCard below. This composes them — it computes nothing new.
//
// PaceCard stays exactly as it was, right under this: the ring, the 7-day
// sparkline and inline reschedule are real, tested, and worth keeping for a
// student who wants the detail. This strip is the answer to "where do I
// stand", in one glance, before that detail.
export function PositionStrip({ streak, shields, pace, targetIso, todayHours }: PositionStripProps) {
  const tone = TONE[pace.status];
  return (
    <div className="rounded-2xl bg-stone-900 px-4 py-3 text-white">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Flame className={streak > 0 ? 'h-4 w-4 text-orange-400' : 'h-4 w-4 text-stone-500'} />
          <span className="text-[14.5px] font-extrabold">{streak}-day streak</span>
          {shields > 0 && (
            <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-stone-300">
              <Shield className="h-2.5 w-2.5" />{shields}
            </span>
          )}
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold ${tone.chipBg} ${tone.chipText}`}>
          {tone.label}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-stone-300">
        <span>Syllabus by <b className="text-white">{fmt(targetIso)}</b></span>
        <span>{Math.round(pace.completedPct)}% covered</span>
        <span>{todayHours}h today</span>
      </div>
    </div>
  );
}
