import Link from 'next/link';
import type { FirstVerdict } from '@/lib/first-verdict';

// ── THE FIRST VERDICT, RENDERED ──────────────────────────────────────────────
//
// See lib/first-verdict.ts for why this exists and the honesty rule it obeys:
// this component may only ever say what the student's OWN 46-topic matrix
// says — a coverage-balance observation, never a claim about ability. It sits
// where the "Log" button used to be the obvious first tap for a student with
// nothing yet to report (activation forensic, 4 Sep): "you've said X, here's
// where your own attention already went" outcompetes "tell us what you did".
//
// The CTA points at #todays-plan — the plan section already on this page —
// rather than opening any modal or asking for new input. Nothing here writes
// anything; it is a read of what onboarding already collected.
export function FirstVerdictCard({ v }: { v: FirstVerdict }) {
  const pct = (s: { touchedTopics: number; totalTopics: number }) =>
    Math.round((s.touchedTopics / s.totalTopics) * 100);

  return (
    <div className="rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50 to-white p-4 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-widest text-teal-700">Your first verdict</p>
      <p className="mt-1 text-[15px] font-bold leading-snug text-stone-900">
        You&apos;ve marked {v.touchedTopics} of {v.totalTopics} topics as started.
      </p>

      <div className="mt-3 space-y-1.5">
        {v.bySection.map((s) => (
          <div key={s.section} className="flex items-center gap-2">
            <span className="w-11 shrink-0 text-[11px] font-bold text-stone-500">{s.label}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100">
              <div
                className={`h-full rounded-full ${s.section === v.quietestSection.section ? 'bg-amber-400' : 'bg-teal-500'}`}
                style={{ width: `${Math.max(4, pct(s))}%` }}
              />
            </div>
            <span className="w-9 shrink-0 text-right text-[11px] font-semibold tabular-nums text-stone-600">{pct(s)}%</span>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[13px] text-stone-700">
        {v.selfReportDisagreesWithCoverage ? (
          <>
            You told us <strong>{v.selfReportedWeakest}</strong> feels weakest — but{' '}
            <strong>{v.quietestSection.label}</strong> is actually the one you&apos;ve touched least so far.
            Worth a look.
          </>
        ) : (
          <>
            Most of your attention has gone to <strong>{v.strongestSection.label}</strong>.{' '}
            <strong>{v.quietestSection.label}</strong> has had the least so far.
          </>
        )}
      </p>

      <Link
        href="#todays-plan"
        className="mt-3 inline-flex items-center gap-1 rounded-full bg-teal-700 px-4 py-2 text-[12.5px] font-bold text-white active:scale-[0.98]"
      >
        See today&apos;s plan →
      </Link>
    </div>
  );
}
