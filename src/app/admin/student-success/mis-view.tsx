import { cn } from '@/lib/utils';
import type {
  Measure, ReturnPicture, InterventionPicture, ConversionPicture,
  LearningPicture, ReachPicture, Evidence,
} from '@/lib/student-success-mis';

// ── The founder's control tower ─────────────────────────────────────────────
//
// Four questions, in the order that matters:
//   1. Are students coming back?
//   2. Are human interventions helping?
//   3. Are students converting into COMPLETED sessions?
//   4. What are we learning that should change the product?
//
// This file is presentation only — every number arrives already computed and
// already graded by lib/student-success-mis. It is a separate component from
// the page so it can be RENDERED IN A TEST without a database, which is the
// whole C0 lesson: 3,124 tests passed while a page threw for any student with
// a mock debrief, because nothing ever rendered it.
//
// NOT A SALES DASHBOARD. There is no rep leaderboard, no calls-per-day, no
// hours-online, no HOT/WARM/COLD count. The human layer appears here only
// through what happened to STUDENTS afterwards.

const EVIDENCE_STYLE: Record<Evidence, string> = {
  FACT: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ASSOCIATED: 'bg-amber-50 text-amber-800 border-amber-200',
  UNKNOWN: 'bg-stone-100 text-stone-500 border-stone-200',
  UNAVAILABLE: 'bg-stone-100 text-stone-500 border-stone-200',
};

function Badge({ e }: { e: Evidence }) {
  return (
    <span className={cn('rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider',
      EVIDENCE_STYLE[e])}>{e}</span>
  );
}

/**
 * A measure renders as a RATE only when the sample earned one. Otherwise the
 * count stands alone and the reason is printed next to it. There is no code
 * path here that turns a null rate into "0%".
 */
function Stat({ m }: { m: Measure }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold leading-tight text-stone-500">{m.label}</p>
        <Badge e={m.evidence} />
      </div>
      <p className="mt-1.5 text-2xl font-bold tabular-nums text-stone-900">
        {m.rate == null
          ? <span className="text-stone-400">—</span>
          : `${Math.round(m.rate * 1000) / 10}%`}
      </p>
      <p className="text-[11px] tabular-nums text-stone-500">
        {m.of == null ? `${m.count}` : `${m.count} of ${m.of}`}
      </p>
      {m.note && <p className="mt-1 text-[10px] leading-snug text-stone-400">{m.note}</p>}
    </div>
  );
}

function Section({ n, q, children }: { n: number; q: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="flex items-baseline gap-2 text-sm font-bold text-stone-900">
        <span className="text-[11px] font-bold text-stone-300">{n}</span>{q}
      </h2>
      {children}
    </section>
  );
}

export interface MisProps {
  ret: ReturnPicture;
  intervention: InterventionPicture;
  conversion: ConversionPicture;
  learning: LearningPicture;
  reach: ReachPicture;
  /** Notification pressure on the students we CAN reach. Null = not measured. */
  pushesPerReachedStudentPerDay: number | null;
}

export function MisView({ ret, intervention, conversion, learning, reach, pushesPerReachedStudentPerDay }: MisProps) {
  return (
    <div className="space-y-6 pb-16">
      <Section n={1} q="Are students coming back?">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat m={ret.activated} />
          <Stat m={ret.d1} />
          <Stat m={ret.d3} />
          <Stat m={ret.d7} />
        </div>
        <p className="text-[11px] text-stone-400">
          Each window counts only students old enough to have had the chance. A student
          who signed up yesterday is not a day-7 failure.
        </p>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat m={reach.pushReach} />
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-[11px] font-semibold leading-tight text-amber-900">
              Students a human is the ONLY way to reach
            </p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums text-amber-900">{reach.humanIsOnlyChannel}</p>
            <p className="text-[10px] leading-snug text-amber-700">
              No push, but a usable phone. For these students the product has no
              channel at all — this is a product gap, measured, not a sales target.
            </p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-3">
            <p className="text-[11px] font-semibold leading-tight text-stone-500">
              Pushes per day, per reachable student
            </p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums text-stone-900">
              {pushesPerReachedStudentPerDay == null
                ? <span className="text-stone-400">—</span>
                : pushesPerReachedStudentPerDay}
            </p>
            <p className="text-[10px] leading-snug text-stone-400">
              {pushesPerReachedStudentPerDay == null
                ? 'Not measured.'
                : 'Counted only over students who actually received one.'}
            </p>
          </div>
        </div>
      </Section>

      <Section n={2} q="Are human interventions helping?">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-stone-200 bg-white p-3">
            <p className="text-[11px] font-semibold text-stone-500">Interventions</p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums text-stone-900">{intervention.interventions}</p>
            <p className="text-[11px] text-stone-500">{intervention.studentsContacted} students · {intervention.reps} reps</p>
          </div>
          <Stat m={intervention.loggedD3} />
          <Stat m={intervention.loggedD7} />
          <div className="rounded-xl border border-stone-200 bg-white p-3">
            <p className="text-[11px] font-semibold text-stone-500">Awaiting outcome</p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums text-stone-900">{intervention.awaitingOutcome}</p>
            <p className="text-[10px] leading-snug text-stone-400">
              The 7-day window has not elapsed. Not failures.
            </p>
          </div>
        </div>

        {intervention.byLane.length === 0 ? (
          <p className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-[12px] text-stone-500">
            No lane has enough measured interventions to compare yet.
          </p>
        ) : (
          <div className="space-y-1.5">
            {intervention.byLane.map((c) => (
              <div key={c.lane} className="rounded-xl border border-stone-200 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[12px] font-bold text-stone-800">{c.lane}</p>
                  <Badge e={c.evidence} />
                </div>
                <p className="mt-1 text-[12px] tabular-nums text-stone-600">
                  contacted {c.reachedLogged}/{c.reached} logged
                  {' · '}not contacted {c.unreachedLogged}/{c.unreached} logged
                  {c.differencePoints != null && (
                    <span className={cn('ml-2 font-bold',
                      c.differencePoints > 0 ? 'text-emerald-700' : 'text-rose-700')}>
                      {c.differencePoints > 0 ? '+' : ''}{c.differencePoints} pts
                    </span>
                  )}
                </p>
                {c.note && <p className="mt-1 text-[10px] leading-snug text-stone-400">{c.note}</p>}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section n={3} q="Are students converting into COMPLETED sessions?">
        {conversion.neverDelivered && (
          <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-[12px] font-semibold text-rose-800">
            {conversion.created} paid sessions created. None has ever been completed.
            Until one is, conversion is not a trustworthy number — a booking is
            not a delivery.
          </p>
        )}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {([
            ['Created', conversion.created], ['Scheduled', conversion.scheduled],
            ['Live now', conversion.active], ['Completed', conversion.completed],
            ['Cancelled', conversion.cancelled], ['Expired', conversion.expired],
          ] as [string, number][]).map(([label, v]) => (
            <div key={label} className="rounded-xl border border-stone-200 bg-white p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">{label}</p>
              <p className="text-xl font-bold tabular-nums text-stone-900">{v}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Stat m={conversion.completion} />
          <div className="rounded-xl border border-stone-200 bg-white p-3">
            <p className="text-[11px] font-semibold text-stone-500">Completed with an observed start</p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums text-stone-900">
              {conversion.completedWithObservedStart}
            </p>
            <p className="text-[10px] leading-snug text-stone-400">
              {conversion.completedStartUnknown} completed without one — the mentor ran
              the call but never tapped start. Recorded as unknown, never invented.
            </p>
          </div>
        </div>
      </Section>

      <Section n={4} q="What are we learning that should change the product?">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat m={learning.capture} />
          <div className="rounded-xl border border-teal-200 bg-teal-50 p-3">
            <p className="text-[11px] font-semibold leading-tight text-teal-900">
              Reasons the PRODUCT can fix
            </p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums text-teal-900">{learning.productFixableCount}</p>
            <p className="text-[10px] leading-snug text-teal-700">
              As opposed to facts about the student&apos;s life, which no feature changes.
            </p>
          </div>
        </div>

        {learning.top.length === 0 ? (
          <p className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-[12px] text-stone-500">
            No structured reasons captured yet. Until reps fill this, the loop
            records what we did and never what we learned.
          </p>
        ) : (
          <>
            {!learning.readable && (
              <p className="text-[11px] font-semibold text-amber-700">
                {learning.withReason} reasons captured — too few to call any of these
                &ldquo;the top reason&rdquo;. Counts only.
              </p>
            )}
            <div className="space-y-1">
              {learning.top.map((r) => (
                <div key={r.reason} className="flex items-center justify-between gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2">
                  <p className="text-[12px] text-stone-700">
                    {r.label}
                    {r.productFixable && (
                      <span className="ml-2 rounded bg-teal-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-teal-800">
                        product can fix
                      </span>
                    )}
                  </p>
                  <p className="text-sm font-bold tabular-nums text-stone-900">{r.count}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </Section>
    </div>
  );
}
