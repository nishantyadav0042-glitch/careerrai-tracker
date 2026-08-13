'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import { track } from '@/lib/journey';

// ── The first log, practised before it's real ───────────────────────────────
//
// Founder, 13 Aug: today's cohort finished onboarding 19/19 and then only
// 4 logged a study day. The plan lands, the ritual doesn't. So the journey's
// last screen is no longer a reveal that ends with a promise — it's the
// student's hands on the actual mechanic: "tap the circle, say how far you
// got, done. That's the whole log."
//
// Three rules, each load-bearing:
//
//   IT IS THE REAL INTERFACE. Same circle, same two-choice "Got halfway /
//   Finished it" strip as TodaysRoutineCard — a tutorial that teaches a
//   different gesture than Day 1 presents un-teaches itself overnight.
//
//   IT IS VISIBLY PRACTICE. Nothing here writes a daily_report or calls
//   complete-task. A student who has studied nothing must never start Day 0
//   with fabricated study data — the learning machine runs on true logs, and
//   "already logged today" would also kill their real Day-1 moment.
//
//   IT NEVER GATES. The skip path is always available. Incident #2 is the
//   memory here: the last time anything stood between a student and
//   completion, a whole cohort's logging died behind it. A tutorial that
//   holds the finish line hostage is that bug wearing a friendly face.
//
// Copy is English throughout, in plain everyday words (founder, 13 Aug:
// "everything should be in english… use simple words which students use in
// daily life") — short sentences, no clever phrasing.

interface PracticeTask {
  id: string;
  section: string;
  title: string;
  minutes: number;
}

// Illustrative, in the exact grammar real plan tasks use ("topic — count").
// Deliberately NOT presented as the student's actual Day 1 — their real
// routine is generated fresh when Home first loads, and promising these
// specific tasks would be a claim the next screen contradicts.
const PRACTICE_TASKS: PracticeTask[] = [
  { id: 'p1', section: 'QA', title: 'Percentages — 20 questions', minutes: 40 },
  { id: 'p2', section: 'VARC', title: 'Reading Comprehension — 2 passages', minutes: 35 },
  { id: 'p3', section: 'DILR', title: 'One puzzle set', minutes: 15 },
];

type Mark = 'full' | 'half';

interface ScreenLogTourProps {
  onNext: (data?: Record<string, unknown>) => Promise<void>;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
  firstName?: string | null;
}

export default function ScreenLogTour({ onNext, isLoading, firstName = null }: ScreenLogTourProps) {
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [choosingId, setChoosingId] = useState<string | null>(null);
  // Stamped after mount (render must stay pure); read once in finish().
  const openedAt = useRef<number | null>(null);
  useEffect(() => {
    if (openedAt.current == null) openedAt.current = Date.now();
  }, []);
  const doneCount = Object.keys(marks).length;
  const allDone = doneCount === PRACTICE_TASKS.length;

  function pick(taskId: string, mark: Mark) {
    setChoosingId(null);
    setMarks((prev) => ({ ...prev, [taskId]: mark }));
  }

  function finish(skipped: boolean) {
    // Measurement, not a write: lets us cohort "practised the log in
    // onboarding" against first real daily_report. Fire-and-forget —
    // telemetry must never block completion.
    track('log_tour_done', {
      practiced: doneCount,
      skipped,
      seconds: openedAt.current == null ? null : Math.round((Date.now() - openedAt.current) / 1000),
    });
    void onNext({ onboardingCompleted: true });
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
          {firstName ? `${firstName}, ` : ''}this is how you&apos;ll log every day
        </h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-stone-600">
          Every day you get 2–3 tasks like these on Home. After studying, tap the
          circle and pick how much you did — <b>that&apos;s it, log done</b>. No typing, no forms.
        </p>
      </div>

      {/* The practice card — visually the real thing, labeled as practice. */}
      <div className="rounded-2xl border border-stone-200 bg-white p-3.5">
        <div className="mb-2 flex items-center justify-between">
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-800">
            Practice — try it
          </span>
          <span className="text-[11px] font-semibold tabular-nums text-stone-400">
            {doneCount}/{PRACTICE_TASKS.length}
          </span>
        </div>

        <div className="space-y-1">
          {PRACTICE_TASKS.map((task, idx) => {
            const mark = marks[task.id];
            const done = mark != null;
            const choosing = choosingId === task.id;
            return (
              <div key={task.id}>
                <div className={cn('flex items-center gap-2.5 rounded-xl bg-stone-50 px-3.5 py-3', choosing && !done && 'rounded-b-none')}>
                  {/* Same tick as TodaysRoutineCard: tap → choose how far. */}
                  <button
                    type="button"
                    aria-label={`Mark progress: ${task.title}`}
                    onClick={() => { if (!done) setChoosingId((cur) => (cur === task.id ? null : task.id)); }}
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors active:scale-90',
                      done
                        ? mark === 'full' ? 'border-stone-900 bg-stone-900' : 'border-amber-500 bg-amber-500'
                        : 'border-stone-300 hover:border-stone-900',
                      // The hint lives on the button itself: the first
                      // untouched circle gently pulses until it's tapped.
                      !done && idx === Object.keys(marks).length && !choosing && 'animate-pulse'
                    )}
                  >
                    {done && (mark === 'full'
                      ? <Check className="h-3.5 w-3.5 text-white" />
                      : <span className="text-[10px] font-black text-white">½</span>)}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-stone-400">{task.section}</span>
                      <span className="ml-auto shrink-0 text-xs text-stone-400">{task.minutes}m</span>
                    </div>
                    <span className={cn('text-sm font-semibold', done ? 'text-stone-400 line-through' : 'text-stone-800')}>
                      {task.title}
                    </span>
                  </div>
                </div>
                {/* The real two-choice strip, verbatim from Home: an honest
                    half-day has its own button, because a student forced to
                    choose between "done" and nothing will pick nothing. */}
                {choosing && !done && (
                  <div className="rounded-b-xl bg-stone-100/70">
                    <div className="flex gap-1.5 px-1 pb-2 pt-1.5">
                      <button
                        type="button"
                        onClick={() => pick(task.id, 'half')}
                        className="flex-1 rounded-lg border border-amber-300 bg-amber-50 py-2 text-[12px] font-bold text-amber-800 transition-transform active:scale-95"
                      >
                        Got halfway
                      </button>
                      <button
                        type="button"
                        onClick={() => pick(task.id, 'full')}
                        className="flex-1 rounded-lg bg-stone-900 py-2 text-[12px] font-bold text-white transition-transform active:scale-95"
                      >
                        Finished it
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {!allDone && doneCount === 0 && (
          <p className="mt-2.5 rounded-lg bg-stone-900 px-2.5 py-1.5 text-[11px] font-semibold text-white">
            Try it — tap the first circle 👆
          </p>
        )}
      </div>

      {allDone ? (
        <div className="rounded-2xl bg-stone-900 p-4 text-center">
          <p className="flex items-center justify-center gap-1.5 text-sm font-bold text-white">
            <Flame className="h-4 w-4 text-orange-400" />
            Done — that&apos;s the whole log.
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-stone-300">
            3 taps, log done. From tomorrow you&apos;ll see this on Home with your real
            topics — and half done also counts, so never skip a day.
          </p>
        </div>
      ) : (
        <p className="text-center text-[11px] text-stone-400">
          This is just practice — nothing is saved. Your real log starts tomorrow.
        </p>
      )}

      <div className="sticky bottom-0 z-20 bg-white/95 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
        {allDone ? (
          <button
            onClick={() => finish(false)}
            disabled={isLoading}
            className="w-full rounded-2xl bg-stone-900 py-3.5 text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-60"
          >
            {isLoading ? 'Finishing up…' : 'Start my prep →'}
          </button>
        ) : (
          // The always-open exit. A tutorial may invite; it must never gate
          // (Incident #2) — completion goes through with zero practice taps.
          <button
            onClick={() => finish(true)}
            disabled={isLoading}
            className="w-full rounded-2xl border border-stone-200 bg-white py-3 text-[13px] font-semibold text-stone-500 transition-all active:scale-[0.98] disabled:opacity-60"
          >
            {isLoading ? 'Finishing up…' : 'Skip practice — start my prep →'}
          </button>
        )}
      </div>
    </div>
  );
}
