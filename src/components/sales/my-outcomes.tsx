import { cn } from '@/lib/utils';
import type { InterventionPicture, Measure } from '@/lib/student-success-mis';

// ── What happened after your calls ──────────────────────────────────────────
//
// The last link in the loop, and the one the rep could not see:
//
//   STUDENT → WHY → EVIDENCE → CONTACT → REASON → INTERVENTION
//                                                      → STUDENT RESPONSE
//                                                      → D1/D3/D7 OUTCOME
//
// Everything up to INTERVENTION already existed. Without this the rep works
// blind: they can see how many calls they made and never whether any student
// was better off — precisely the incentive that turns a student-success rep
// into a dialler.
//
// THE ORDER ON THIS STRIP IS THE POLICY. Students who logged comes first and
// biggest. Calls made is a small grey line at the end, present only because a
// rep needs to know their own throughput to plan a day — never as the score,
// and never compared against another rep.
//
// It reuses interventionPicture() from the founder's view rather than
// computing its own numbers, so a rep and the founder can never be looking at
// two different truths about the same week.

function Big({ m, tone }: { m: Measure; tone: 'good' | 'plain' }) {
  return (
    <div className={cn('rounded-xl border p-3',
      tone === 'good' ? 'border-emerald-200 bg-emerald-50' : 'border-stone-200 bg-white')}>
      <p className={cn('text-[11px] font-semibold leading-tight',
        tone === 'good' ? 'text-emerald-900' : 'text-stone-500')}>{m.label}</p>
      <p className={cn('mt-1 text-2xl font-bold tabular-nums',
        tone === 'good' ? 'text-emerald-900' : 'text-stone-900')}>
        {m.count}
        {m.of != null && <span className="text-sm font-semibold opacity-60"> / {m.of}</span>}
      </p>
      {m.rate != null && (
        <p className={cn('text-[11px] font-semibold',
          tone === 'good' ? 'text-emerald-700' : 'text-stone-500')}>
          {Math.round(m.rate * 1000) / 10}%
        </p>
      )}
      {m.note && <p className="mt-0.5 text-[10px] leading-snug text-stone-400">{m.note}</p>}
    </div>
  );
}

export function MyOutcomes({ picture, sessionsCompleted, days = 30 }: {
  picture: InterventionPicture;
  /** Completed 299 sessions after this rep's contact. A booking is not one. */
  sessionsCompleted: number | null;
  days?: number;
}) {
  if (picture.interventions === 0) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
        <p className="text-[13px] font-semibold text-stone-700">No calls logged yet.</p>
        <p className="mt-0.5 text-[11px] leading-snug text-stone-500">
          Once you start logging calls, this is where you will see what happened
          to those students afterwards — not how many calls you made.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-2xl border border-stone-200 bg-white p-4">
      <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">
        What happened after your calls · {days} days
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Big m={picture.loggedD3} tone="good" />
        <Big m={picture.loggedD7} tone="good" />
        <div className="rounded-xl border border-teal-200 bg-teal-50 p-3">
          <p className="text-[11px] font-semibold leading-tight text-teal-900">
            Sessions actually completed
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-teal-900">
            {sessionsCompleted == null ? <span className="text-teal-400">—</span> : sessionsCompleted}
          </p>
          <p className="text-[10px] leading-snug text-teal-700">
            Delivered, not booked. A booking is a promise; this is the promise kept.
          </p>
        </div>
      </div>

      {picture.awaitingOutcome > 0 && (
        <p className="text-[11px] text-stone-500">
          <b className="tabular-nums">{picture.awaitingOutcome}</b> of your calls are still
          inside their 7-day window — not yet measurable, and not failures.
        </p>
      )}

      {/* Volume, deliberately last, deliberately small, deliberately grey. */}
      <p className="border-t border-stone-100 pt-2 text-[11px] text-stone-400">
        For your planning only: {picture.interventions} call
        {picture.interventions === 1 ? '' : 's'} logged across {picture.studentsContacted} student
        {picture.studentsContacted === 1 ? '' : 's'}.
      </p>
    </div>
  );
}
