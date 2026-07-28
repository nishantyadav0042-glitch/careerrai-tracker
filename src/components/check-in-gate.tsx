'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { track } from '@/lib/journey';
import { tourDone, notifAskVisible, insightVisible } from '@/lib/first-run-events';
import {
  OUTCOME_OPTIONS, BLOCKER_REASONS, outcomeAsksWhy, type DayOutcome,
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

// ── The payoff ──────────────────────────────────────────────────────────────
// The loop's reward stage. Before this, the check-in ended in a silent
// router.refresh(): the plan really did rebuild, but the student never watched
// it happen, so the causal link they were supposed to feel stayed invisible.
// Now the answer hands back the actual timetable it produced.
//
// `because` is plan-reason.ts's specific, TRUE line ("Geometry first — it
// didn't get finished yesterday"). It is null whenever no true specific claim
// exists, and we render nothing rather than inventing one. Never manufacture a
// causal claim here to make the moment feel better.
interface TodayPlan {
  because: string | null;
  tasks: { id?: string; topic?: string | null; label?: string; estMinutes?: number; section?: string }[];
  estMinutes: number;
}

async function fetchTodayPlan(): Promise<TodayPlan | null> {
  try {
    const res = await fetch('/api/routine/today');
    if (!res.ok) return null;
    const d = await res.json();
    const tasks = Array.isArray(d?.routine?.tasks) ? d.routine.tasks : [];
    if (tasks.length === 0) return null; // nothing to show — don't fake a payoff
    return {
      because: typeof d?.because === 'string' && d.because.length > 0 ? d.because : null,
      tasks,
      estMinutes: typeof d?.routine?.est_minutes === 'number' ? d.routine.est_minutes : 0,
    };
  } catch {
    return null;
  }
}

export function CheckInGate({ yesterdayStr, yesterdayLabel, variant = 'A' }: Props) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [done, setDone] = useState(false);
  const [outcome, setOutcome] = useState<DayOutcome | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState<DayOutcome | null>(null);
  const [plan, setPlan] = useState<TodayPlan | null>(null);
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
          sections: [],
          energy: '💪',
        }),
      });
      if (!res.ok) throw new Error('save failed');
      track('checkin_completed', { outcome: finalOutcome, reason: finalReason, forDate: yesterdayStr, variant });
      // The coach-thinking moment. The plan REALLY is rebuilt from this
      // answer — /api/routine/today recomputes and the because-line names what
      // changed. These two seconds exist so the student watches the connection
      // happen instead of getting a silent refresh.
      setAnalyzing(finalOutcome);
      // Fetch the rebuilt plan DURING the thinking beat, not after it, so the
      // payoff lands the moment the beat ends and costs no extra waiting.
      const [fetched] = await Promise.all([
        fetchTodayPlan(),
        new Promise((r) => setTimeout(r, 2200)),
      ]);
      if (fetched) {
        setPlan(fetched);
        track('checkin_payoff_shown', {
          outcome: finalOutcome, forDate: yesterdayStr, variant,
          taskCount: fetched.tasks.length, hasBecause: fetched.because != null,
        });
      } else {
        // No plan to hand back (engine error, rest day, empty routine). Close
        // exactly as before rather than showing an empty "here's today".
        finish();
      }
    } catch {
      setError("Couldn't save that. Check your connection and try again.");
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

  // The payoff — "we've got yesterday, here is the today it produced."
  if (plan) {
    const shown = plan.tasks.slice(0, 5);
    const more = plan.tasks.length - shown.length;
    const hours = Math.round((plan.estMinutes / 60) * 10) / 10;
    return (
      <div className="fixed inset-0 z-[80] flex items-end justify-center bg-stone-900/70 p-4 backdrop-blur-sm sm:items-center">
        <div className="max-h-[88vh] w-full max-w-sm overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
          <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-600">
            ✓ Got your progress
          </p>
          <h2 className="mt-1.5 text-xl font-bold leading-snug text-stone-900">
            Here&apos;s today, rebuilt around it.
          </h2>

          {/* Only rendered when plan-reason produced a TRUE specific claim. */}
          {plan.because && (
            <p className="mt-3 rounded-xl border border-orange-100 bg-orange-50 px-3.5 py-2.5 text-[13px] font-semibold leading-snug text-stone-800">
              {plan.because}
            </p>
          )}

          <div className="mt-4 space-y-1.5">
            {shown.map((t, i) => (
              <div
                key={t.id ?? `${t.topic ?? 'task'}-${i}`}
                className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-3.5 py-2.5"
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-stone-900 text-[11px] font-bold text-white">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-bold text-stone-900">
                    {t.topic ?? t.label ?? 'Study block'}
                  </span>
                  {t.section && (
                    <span className="block text-[11px] text-stone-500">{t.section}</span>
                  )}
                </span>
                {typeof t.estMinutes === 'number' && t.estMinutes > 0 && (
                  <span className="shrink-0 text-[11px] font-semibold text-stone-400">
                    {t.estMinutes}m
                  </span>
                )}
              </div>
            ))}
            {more > 0 && (
              <p className="pt-0.5 text-center text-[11px] font-medium text-stone-400">
                +{more} more in today&apos;s plan
              </p>
            )}
          </div>

          {hours > 0 && (
            <p className="mt-3 text-center text-[12px] text-stone-500">
              {plan.tasks.length} {plan.tasks.length === 1 ? 'block' : 'blocks'} · about {hours}h
            </p>
          )}

          <button
            type="button"
            onClick={() => { track('checkin_payoff_start', { forDate: yesterdayStr, variant }); finish(); }}
            className="mt-5 w-full rounded-2xl bg-stone-900 py-3.5 text-sm font-bold text-white transition-all active:scale-[0.98] hover:bg-stone-800"
          >
            Start today →
          </button>
        </div>
      </div>
    );
  }

  if (analyzing) {
    const lines: Record<DayOutcome, string> = {
      studied: 'Locking yesterday in…',
      partial: "Noting where you stopped — today starts there…",
      not_studied: 'No problem. Rebuilding today so nothing is lost…',
      skipped: 'Rest logged. Picking up exactly where you left off…',
    };
    return (
      <div className="fixed inset-0 z-[80] flex items-end justify-center bg-stone-900/70 p-4 backdrop-blur-sm sm:items-center">
        <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-2xl">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-[3px] border-stone-200 border-t-orange-500" />
          <p className="mt-5 text-sm font-bold text-stone-900">{lines[analyzing]}</p>
          <p className="mt-1.5 text-[12px] text-stone-500">Rebuilding today&apos;s plan from your check-in.</p>
        </div>
      </div>
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
