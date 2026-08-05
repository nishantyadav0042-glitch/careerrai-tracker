import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import type { BreachResult } from '@/lib/plan-breach';

// The red alert (founder, 5 Aug): "if a student doesn't follow the rules or
// logs, send a red alert — tell them they are breaching their study plan."
//
// Deliberately NOT a modal and NOT dismissible. A breach is a standing fact
// about their plan, not a popup to swat — it goes away by logging or by
// replanning, which are exactly the two buttons here. It also never shames:
// the copy states the arithmetic and offers the fix, because the student set
// this date themselves and our job is to hold it up, not to scold.
//
// Only 'breach' and 'critical' reach this component (see isAlertable) —
// drifting is handled by the ordinary nudges, so red stays rare enough to
// still mean something.
export function BreachAlert({ breach }: { breach: BreachResult }) {
  const critical = breach.level === 'critical';
  return (
    <section
      role="alert"
      className={`rounded-2xl border-2 p-4 ${
        critical ? 'border-red-300 bg-red-50' : 'border-orange-300 bg-orange-50'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${critical ? 'text-red-600' : 'text-orange-600'}`} />
        <div className="min-w-0">
          <p className={`text-[10px] font-bold uppercase tracking-widest ${critical ? 'text-red-700' : 'text-orange-700'}`}>
            {critical ? 'Plan breached' : 'You are off your plan'}
          </p>
          <p className="mt-1 text-[14px] font-semibold leading-snug text-stone-900">
            {breach.studentLine}
          </p>

          {/* The arithmetic, always. A number a student can check is a number
              they can trust — the same rule the replan engine follows. */}
          <ul className="mt-2 space-y-0.5">
            {breach.receipts.map((r) => (
              <li key={r} className="text-[12px] leading-snug text-stone-600">· {r}</li>
            ))}
          </ul>

          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/student/tracker#log"
              className="rounded-xl bg-stone-900 px-3.5 py-2 text-[13px] font-bold text-white"
            >
              Log today
            </Link>
            {/* The honest second door: when the debt can no longer fit inside
                the window, logging harder is not the answer — the plan is
                wrong and should be rebuilt. */}
            {breach.targetAtRisk && (
              <Link
                href="/student/plan"
                className={`rounded-xl px-3.5 py-2 text-[13px] font-bold ${
                  critical ? 'bg-red-600 text-white' : 'border border-stone-300 bg-white text-stone-700'
                }`}
              >
                Fix my plan →
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
