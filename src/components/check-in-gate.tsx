'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { track } from '@/lib/journey';
import { PlanRebuildPayoff } from '@/components/plan-rebuild-payoff';
import { tourDone, notifAskVisible, insightVisible } from '@/lib/first-run-events';
import {
  OUTCOME_OPTIONS, BLOCKER_REASONS, outcomeAsksWhy, outcomeNeedsDuration, type DayOutcome,
} from '@/lib/check-in';

// ── The daily check-in gate ─────────────────────────────────────────────────
//
// Shown once, on open, when YESTERDAY has no entry. Thirty seconds, four taps
// at most, then today begins.
//
// Three rules it must never break:
//
//  1. YESTERDAY ONLY, NEVER OLDER. A student returning after two weeks sees
//     one question, not fourteen. Enforced twice: this component is only
//     mounted for yesterday, and the log route refuses any log_date that is
//     not today or yesterday IST.
//  2. NO SHAME. There is no wrong answer here, and the copy never implies
//     one. "Didn't study" sits at the same visual weight as "Studied" — the
//     moment the honest answer looks like the loser, people stop being honest
//     and the data becomes decoration.
//  3. IT IS A CHECK-IN, NOT A LOG. Students tolerate reflection and resent
//     admin. Same 30 seconds, different completion rate.
//
// The follow-up — "what got in the way?" — is the reason this screen earns its
// interruption. Right now a student who vanishes is indistinguishable from a
// student who was at work, and those need completely different products.

interface Props {
  yesterdayStr: string;    // ISO date — what we write
  yesterdayLabel: string;  // e.g. "26 Jul" — what the student reads
  /**
   * Framing experiment (co-founder spec, 29 Jul). Assigned server-side from a
   * stable hash of the student id, so each student always sees one framing:
   *   A — task framing:  "Quick check-in — how did yesterday go?"
   *   B — coach framing: "Your coach needs yesterday before it can finish
   *                       today's plan."
   * Same four buttons, same follow-up, same writes. Only the story differs.
   * Measured via the variant prop on checkin_shown/answered/completed —
   * completion rate, next-day return. HYPOTHESIS (untested): B outperforms A.
   */
  variant?: 'A' | 'B';
}

export function CheckInGate({ yesterdayStr, yesterdayLabel, variant = 'A' }: Props) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [done, setDone] = useState(false);
  const [outcome, setOutcome] = useState<DayOutcome | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [noticed, setNoticed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const askWhy = outcome != null && outcomeAsksWhy(outcome);

  // Never on top of the first-run sequence. A student meeting the app for the
  // first time has no yesterday worth asking about, and stacking this on the
  // tour is how a check-in becomes an obstacle.
  useEffect(() => {
    if (done) return;
    const timer = setTimeout(() => {
      if (!tourDone() || notifAskVisible() || insightVisible()) return;
      setVisible(true);
      track('checkin_shown', { forDate: yesterdayStr, variant });
    }, 900);
    return () => clearTimeout(timer);
  }, [done, yesterdayStr]);

  const finish = () => {
    setDone(true);
    setVisible(false);
    // Today's plan, streak and pace all change once yesterday is recorded.
    router.refresh();
  };

  async function submit(finalOutcome: DayOutcome, finalReason: string | null) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/logging/log-daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          log_date: yesterdayStr,
          day_outcome: finalOutcome,
          blocker_reason: finalReason ?? undefined,
          // A check-in is not a study claim. Hours and sections stay empty;
          // the full sheet is where a student describes what they actually did.
          hours: 0,
          // J6-A: this 0 means "never asked", not "studied zero hours".
          hours_source: 'not_collected',
          sections: [],
          energy: '💪',
        }),
      });
      if (!res.ok) {
        // P0-1: never invent a failure the server did not report. A 429 here
        // means the check-in is already saved and only a too-fast EDIT was
        // declined — telling the student to "check your connection" is a lie
        // about their own data.
        const serverMessage = await res.json()
          .then((b: { error?: string }) => (typeof b?.error === 'string' ? b.error : null))
          .catch(() => null);
        throw new Error(serverMessage ?? 'save failed');
      }
      // The guaranteed insight (founder, 17 Aug): the same server line the
      // full log sheet shows — a check-in is a log too, and no log ends
      // empty-handed. Best-effort parse; a body we can't read never blocks
      // the payoff.
      try {
        const data = (await res.json()) as { milestone?: string | null; daily_nudge?: string | null };
        setNoticed(data.milestone ?? data.daily_nudge ?? null);
      } catch { /* payoff simply shows no noticed line */ }
      track('checkin_completed', { outcome: finalOutcome, reason: finalReason, forDate: yesterdayStr, variant });

      // Q5 (founder ruling, 18 Aug) — the gate does not pretend to have
      // finished an answer it never asked. "Studied" and "Studied a bit" mean
      // work happened, and the gate has no field for how much; posting hours: 0
      // produced 62 rows nobody could read, which weekly-plan-reconcile treated
      // as a literal zero and used to push the student's finish date out.
      //
      // The outcome is already SAVED at this point, deliberately. A student who
      // abandons the sheet still keeps the day and the streak, stamped
      // `not_collected` — the honest state, and strictly better than today
      // where they get the same row with no invitation to finish it. Completing
      // the sheet upserts this same (student, date) row to real hours and
      // `credited`, so the unanswered state is transient rather than terminal.
      if (outcomeNeedsDuration(finalOutcome)) {
        track('checkin_handoff_to_log', { outcome: finalOutcome, forDate: yesterdayStr });
        try {
          window.dispatchEvent(new CustomEvent('cr-open-log-for-date', { detail: { date: yesterdayStr } }));
        } catch { /* if the handoff cannot fire, the answer is still saved */ }
        finish();
        return;
      }
      // Hand over to the shared payoff: it narrates the rebuild 0 -> 100% and
      // then shows the plan that came out of this answer. The rebuild it
      // narrates is real — /api/routine/today recomputes from the row just
      // written and plan-reason.ts names what changed.
      setRebuilding(true);
    } catch (e) {
      setError(e instanceof Error && e.message !== 'save failed'
        ? e.message
        : "Couldn't save that. Check your connection and try again.");
      setSaving(false);
    }
  }

  function choose(o: DayOutcome) {
    setOutcome(o);
    track('checkin_answered', { outcome: o, forDate: yesterdayStr, variant });
    // Answers that need no follow-up finish immediately — one tap, done.
    if (!outcomeAsksWhy(o)) void submit(o, null);
  }

  if (!visible || done) return null;

  if (rebuilding) {
    return (
      <PlanRebuildPayoff
        source="check_in"
        forLabel={yesterdayLabel}
        noticed={noticed}
        onDone={finish}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-stone-900/70 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">

        {!askWhy ? (
          <>
            <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">
              {variant === 'B' ? "Your coach is waiting on one thing" : 'Quick check-in'}
            </p>
            <h2 className="mt-1.5 text-xl font-bold leading-snug text-stone-900">
              {variant === 'B'
                ? <>Today&apos;s plan can&apos;t be finished until we know how {yesterdayLabel} went.</>
                : <>Before we start today — how did {yesterdayLabel} go?</>}
            </h2>
            <p className="mt-1.5 text-[13px] text-stone-500">
              {variant === 'B'
                ? 'About 15 seconds. Every answer makes tomorrow smarter.'
                : "Takes a few seconds. There's no wrong answer."}
            </p>

            <div className="mt-5 space-y-2">
              {OUTCOME_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  disabled={saving}
                  onClick={() => choose(o.id)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3.5 text-left transition-all active:scale-[0.98] hover:border-stone-300 disabled:opacity-50"
                >
                  <span className="text-xl">{o.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-stone-900">{o.label}</span>
                    <span className="block text-[11px] text-stone-500">{o.sub}</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">
              One more thing
            </p>
            <h2 className="mt-1.5 text-xl font-bold leading-snug text-stone-900">
              What got in the way?
            </h2>
            <p className="mt-1.5 text-[13px] text-stone-500">
              This is how we make your plan fit your actual life.
            </p>

            <div className="mt-4 flex flex-wrap gap-1.5">
              {BLOCKER_REASONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  disabled={saving}
                  onClick={() => { setReason(r.value); void submit(outcome!, r.value); }}
                  className={`rounded-full px-3.5 py-2 text-[13px] font-semibold transition-all active:scale-95 disabled:opacity-50 ${
                    reason === r.value
                      ? 'bg-stone-900 text-white'
                      : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={saving}
              onClick={() => void submit(outcome!, null)}
              className="mt-4 w-full py-2 text-[13px] font-semibold text-stone-400 disabled:opacity-50"
            >
              Skip this
            </button>
          </>
        )}

        {error && (
          <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-[12px] text-rose-700">{error}</p>
        )}
        {saving && !error && (
          <p className="mt-3 text-center text-[12px] text-stone-400">Saving…</p>
        )}
      </div>
    </div>
  );
}
