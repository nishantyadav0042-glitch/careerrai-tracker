'use client';

import { useEffect, useRef, useState } from 'react';
import { track } from '@/lib/journey';

// ── The payoff: "your study plan is rebuilding, and here is what it built" ───
//
// The reward stage of the daily loop, shared by BOTH surfaces that record a day:
// the check-in gate (yesterday, on app open) and the today's-study sheet. Before
// this, each ended somewhere that told the student nothing about their plan —
// the sheet showed "Logged! 🎉 Your streak is now 1 day", a celebration of the
// act of recording rather than of anything the recording produced.
//
// Founder, 29 Jul: the student should watch the plan being rebuilt (0 → 100%)
// and then be handed the plan itself, framed as the consequence of what they
// just told us. The progress is deliberately VISIBLE and counted, not a spinner:
// a spinner says "waiting", a filling bar says "work is being done for you".
//
// THE HONESTY RULE, same as plan-reason.ts: the bar is theatre in its TIMING
// only — the rebuild it narrates is real. /api/routine/today genuinely
// recomputes today's routine from the answer just written, and `because` is the
// specific, TRUE line naming what changed. When the engine has no true specific
// claim, `because` is null and we render no claim at all. Never manufacture a
// causal sentence to make this moment feel better; the first time a student
// catches the app taking credit for a change that didn't happen, the loop
// becomes theatre and dies.

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
    if (tasks.length === 0) return null; // nothing to hand back — don't fake it
    return {
      because: typeof d?.because === 'string' && d.because.length > 0 ? d.because : null,
      tasks,
      estMinutes: typeof d?.routine?.est_minutes === 'number' ? d.routine.est_minutes : 0,
    };
  } catch {
    return null;
  }
}

// The stages narrate what the request is actually doing, in order. Each label
// must stay true to the work: read the day, recompute the plan, name the reason.
const STAGES: { until: number; label: string }[] = [
  { until: 30,  label: 'Reading what you did…' },
  { until: 62,  label: 'Rebuilding your study plan…' },
  { until: 88,  label: 'Ordering today by what needs you most…' },
  { until: 100, label: 'Ready.' },
];

const BUILD_MS = 2400;

interface Props {
  /** Closes the payoff. Callers refresh the page here — the plan has changed. */
  onDone: () => void;
  /** Shown as a small line under the heading when there's a run to protect. */
  streak?: number | null;
  /** Which surface opened this, for telemetry only. */
  source: 'check_in' | 'today_sheet';
  /** Named day the student just reported on, e.g. "26 Jul". Omit for today. */
  forLabel?: string;
  /**
   * Server-generated milestone or daily-nudge line ("CareerRai noticed…").
   * Carried over from the old success modal, which is the only thing on that
   * screen worth keeping — it is real, per-student, and earned.
   */
  noticed?: string | null;
}

export function PlanRebuildPayoff({ onDone, streak, source, forLabel, noticed }: Props) {
  const [pct, setPct] = useState(0);
  const [plan, setPlan] = useState<TodayPlan | null>(null);
  const [settled, setSettled] = useState(false);
  const planRef = useRef<TodayPlan | null>(null);

  // Fetch immediately, in parallel with the bar. The bar's job is to make the
  // wait legible, never to create one.
  useEffect(() => {
    let alive = true;
    void fetchTodayPlan().then((p) => { if (alive) planRef.current = p; });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = now - start;
      const next = Math.min(100, Math.round((elapsed / BUILD_MS) * 100));
      setPct(next);
      if (next < 100) { raf = requestAnimationFrame(tick); return; }
      // Bar finished. Hand over whatever the fetch produced — if it produced
      // nothing, close silently rather than show an empty "here's today".
      const p = planRef.current;
      if (p) {
        setPlan(p);
        track('checkin_payoff_shown', {
          source, taskCount: p.tasks.length, hasBecause: p.because != null,
        });
      } else {
        onDone();
      }
      setSettled(true);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stage = STAGES.find((s) => pct <= s.until) ?? STAGES[STAGES.length - 1];

  // ── Building ──────────────────────────────────────────────────────────────
  if (!plan) {
    if (settled) return null; // fetch failed; onDone() already fired
    return (
      <div className="fixed inset-0 z-[90] flex items-end justify-center bg-stone-900/70 p-4 backdrop-blur-sm sm:items-center">
        <div className="w-full max-w-sm rounded-3xl bg-white p-7 shadow-2xl">
          <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-600">
            ✓ Got your progress{forLabel ? ` · ${forLabel}` : ''}
          </p>
          <h2 className="mt-2 text-xl font-bold leading-snug text-stone-900">
            Updating your study plan
          </h2>

          <div className="mt-5 flex items-baseline gap-2">
            <span className="text-4xl font-extrabold tabular-nums tracking-tight text-stone-900">{pct}</span>
            <span className="text-lg font-bold text-stone-400">%</span>
          </div>

          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-stone-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-500 transition-[width] duration-100 ease-linear"
              style={{ width: `${pct}%` }}
            />
          </div>

          <p className="mt-3 text-[13px] font-semibold text-stone-600">{stage.label}</p>
        </div>
      </div>
    );
  }

  // ── The plan it produced ──────────────────────────────────────────────────
  const shown = plan.tasks.slice(0, 5);
  const more = plan.tasks.length - shown.length;
  const hours = Math.round((plan.estMinutes / 60) * 10) / 10;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-stone-900/70 p-4 backdrop-blur-sm sm:items-center">
      <div className="max-h-[88vh] w-full max-w-sm overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
        <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-600">
          ✓ Study plan updated
        </p>
        <h2 className="mt-1.5 text-xl font-bold leading-snug text-stone-900">
          This is today&apos;s study.
        </h2>
        <p className="mt-1 text-[13px] text-stone-500">
          {forLabel ? `Built from your ${forLabel} progress.` : 'Built from the progress you just added.'}
          {typeof streak === 'number' && streak > 1 ? ` 🔥 ${streak}-day run.` : ''}
        </p>

        {noticed && (
          <div className="mt-3 rounded-xl bg-stone-900 px-3.5 py-2.5 text-left">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-orange-400">
              CareerRai noticed
            </p>
            <p className="mt-0.5 text-[13px] leading-snug text-white">{noticed}</p>
          </div>
        )}

        {/* Rendered only when the engine had a TRUE specific reason. */}
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
                {t.section && <span className="block text-[11px] text-stone-500">{t.section}</span>}
              </span>
              {typeof t.estMinutes === 'number' && t.estMinutes > 0 && (
                <span className="shrink-0 text-[11px] font-semibold text-stone-400">{t.estMinutes}m</span>
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
          onClick={() => { track('checkin_payoff_start', { source }); onDone(); }}
          className="mt-5 w-full rounded-2xl bg-stone-900 py-3.5 text-sm font-bold text-white transition-all active:scale-[0.98] hover:bg-stone-800"
        >
          Start today →
        </button>
      </div>
    </div>
  );
}
