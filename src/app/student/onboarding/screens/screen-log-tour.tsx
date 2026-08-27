'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import { track } from '@/lib/journey';
import { InsightCardFace } from '@/components/home/insight-bubble';
import { WeeklyReviewCard } from '@/components/home/weekly-review-card';
import type { DailyInsight } from '@/lib/daily-insight';
import type { WeeklyInsight } from '@/lib/weekly-insight';

// ── The two samples, typed against the REAL contracts ──────────────────────
//
// Both are hand-written copy, NOT engine output — day 0 has no rows, and
// running computeDailyInsight/computeWeeklyInsight against a student with no
// history would mean inventing the history. What the types buy is that the
// samples cannot describe a shape the product no longer produces: change
// DailyInsight or WeeklyInsight and this file stops compiling.
//
// The numbers below are the same fictional week the planned-vs-actual table
// underneath shows, so the sample review and the sample week agree with each
// other. A demo whose own numbers disagree teaches a student not to trust the
// real one.
//
// The evidence lines are deliberately in plain language rather than naming
// tables the way the real engine does. On a demo a table name is not
// provenance, it is set dressing — and the screen's own guard forbids this
// file from mentioning a table at all, precisely so nobody can quietly start
// reading one here.

const SAMPLE_DAILY: DailyInsight = {
  kind: 'avoidance',
  title: '📊 A pattern in your week',
  text: 'Only 1 of 4 DILR tasks done. Give DILR 20 minutes first tomorrow.',
  subject: 'DILR',
};

const SAMPLE_WEEKLY: WeeklyInsight = {
  status: 'ready',
  start: '2026-08-17',
  end: '2026-08-23',
  headline: 'A working week, with one thing pushing back.',
  sections: [
    { id: 'consistency', label: 'How often you showed up',
      text: "You logged 6 of the week's 7 days.", evidence: 'from 6 logged days' },
    { id: 'planned_vs_actual', label: 'Planned vs actual',
      text: 'Your plan asked for 9 tasks. You finished 6.', evidence: 'from 6 daily plans and what was ticked off them' },
    { id: 'slipping', label: 'What fought back',
      text: 'DILR — 3 tasks marked hard. Start next week there, while you are fresh.', evidence: 'from 3 tasks marked hard' },
    { id: 'behaviour', label: 'When your work happens',
      text: '71% of what you finished was before noon. Your mornings are carrying this.', evidence: 'from when each task was ticked' },
    { id: 'next_week', label: 'One thing for next week',
      text: 'Give DILR the first twenty minutes of three days. Earlier, not longer.', evidence: 'derived from the slipping section (DILR)' },
  ],
};

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
//
// ── 26 Aug: the practice now PAYS OFF ───────────────────────────────────────
//
// Measured: 403 students reached this screen, 317 skipped it (79%), and the
// 64 who practised logged at the same rate as the skippers — 26.6% vs 25.4%.
// Teaching the gesture changed nothing, because the gesture was never the
// problem. The student left this screen knowing HOW to log and having no idea
// WHY they would.
//
// So the practice now ends in a SAMPLE INSIGHT — one page that shows what a
// week of logs lets CareerRai see: not hours, a pattern the student in the
// sample didn't notice about themselves. Observation → meaning → action.
// The founder's bar, paraphrased: the student should feel "if I log daily,
// I get told things about my own prep that I genuinely didn't know."
//
// THE SAMPLE IS A SAMPLE. It is labelled, it writes nothing, it calls no
// insight engine — postLogInsight and computePrescriptiveLine stay the only
// real-insight authorities, and this screen is hardcoded copy. The ladder at
// the bottom promises ONLY what those engines already do today (day-2
// comparison, avoidance patterns, plan-vs-actual) — a promise the product
// can't keep yet would poison the exact trust this screen exists to build.
//
// And the word "Skip" is gone (founder: "that was part of the original
// problem"). The early exit REMAINS — Incident #2's rule that nothing may
// gate completion is untouched — but it now reads as deferral, not
// permission to ignore.

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
  const [phase, setPhase] = useState<'practice' | 'insight'>('practice');
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

  function reveal() {
    setPhase('insight');
    // Same fire-and-forget contract as log_tour_done: measurement never blocks.
    track('sample_insight_shown', {
      practiced: doneCount,
      seconds: openedAt.current == null ? null : Math.round((Date.now() - openedAt.current) / 1000),
    });
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

  // ── THE SAMPLE INSIGHT ────────────────────────────────────────────────────
  //
  // One fictional student's week, deliberately MESSY — a tidy 2h/2h/2h demo
  // reads as demo and teaches nothing. This week has the single most common
  // real pattern in our logs: planning the feared section and doing the
  // comfortable one instead. The reveal is that pattern, not the hours.
  //
  // Structure is fixed: OBSERVATION (what the logs show) → MEANING (what it
  // says about the student) → ACTION (the one thing to do tomorrow). One
  // discovery only — a second finding would turn the page into a dashboard,
  // and dashboards get admired and closed.
  //
  // TWO LAYERS, NAMED (27 Aug). This screen always showed a WEEK-shaped
  // sample — six planned-vs-actual rows and one pattern across them — while
  // the thing a student meets first is the DAILY line on Home. Students were
  // therefore shown the slower layer and given the faster one, with nothing
  // saying they were different. Both are now labelled and both are samples:
  //
  //   daily   → computeDailyInsight()   one line, every day, one observation
  //   weekly  → computeWeeklyInsight()  the closed week, every Monday
  //
  // The samples below are STATIC COPY, not a second engine. They are hand-
  // written to match the SHAPE those two functions produce — a single
  // clamped sentence for the daily, an evidence-gated observation for the
  // weekly — and screen-log-tour.guard.test.ts pins that correspondence.
  // Running the real engines here would mean inventing rows for a student
  // who has none, which is the one thing day 0 must never do.
  if (phase === 'insight') {
    return (
      <div className="space-y-4">
        <div>
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-800">
            Sample — nobody&apos;s real data
          </span>
          <h3 className="mt-2 text-xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
            This is what your logs unlock
          </h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-stone-600">
            Your logs get read twice — once every day, once every week. Here is
            each one, from a student who logged 6 days.
          </p>
        </div>

        {/* LAYER 1 — the daily line, drawn by the REAL component.
            InsightCardFace is the same code that renders the card on Home, so
            this sample cannot drift from the thing the student actually meets
            tomorrow. What it deliberately is NOT is the whole InsightBubble:
            that one writes cr_insight_seen_<studyDay> to localStorage and
            fires track('insight_shown'), so rendering it here would log a
            shown-insight for a sample AND — if the student dismissed it —
            mark their real first insight as already seen, so it would never
            appear. The face is shared; the side effects stay on Home. */}
        <div className="rounded-2xl border border-stone-200 bg-white p-3.5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Every day · on Home</p>
            <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-stone-500">Sample</span>
          </div>
          <div className="mt-2 overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-4">
            <InsightCardFace title={SAMPLE_DAILY.title} text={SAMPLE_DAILY.text} />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-stone-500">
            <b className="text-stone-700">One thing about today.</b> It changes when your logs
            change — never the same line twice in a week.
          </p>
        </div>

        {/* LAYER 2 — the week, drawn by the REAL WeeklyReviewCard. That
            component holds only useState: no storage, no analytics, nothing
            that can leak into the student's own record, so it is safe to
            render whole. SAMPLE_WEEKLY is typed as WeeklyInsight, so if the
            engine's contract changes this stops compiling instead of quietly
            showing a shape the product no longer produces. */}
        <div className="flex items-center justify-between pt-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Every Monday · your finished week</p>
          <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-stone-500">Sample</span>
        </div>

        <WeeklyReviewCard insight={SAMPLE_WEEKLY} />

        <p className="text-[11px] leading-relaxed text-stone-500">
          <b className="text-stone-700">The pattern across a whole week.</b> Tap it open — that is
          what a real Monday looks like. Here is the week those numbers came from:
        </p>

        {/* The week — planned vs what actually happened. Messy on purpose. */}
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
          <div className="grid grid-cols-[44px_1fr_1fr] gap-x-2 border-b border-stone-100 bg-stone-50 px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider text-stone-400">
            <span /> <span>Planned</span> <span>Actually did</span>
          </div>
          {([
            ['Mon', 'Quant + DILR', 'Quant', true],
            ['Tue', 'VARC + Quant', 'VARC + Quant', false],
            ['Wed', 'DILR', 'Quant', true],
            ['Thu', 'Quant + DILR', 'Quant', true],
            ['Fri', 'VARC', 'VARC', false],
            ['Sat', 'DILR', 'DILR ✓', false],
          ] as const).map(([day, plan, did, slipped]) => (
            <div key={day} className="grid grid-cols-[44px_1fr_1fr] gap-x-2 border-b border-stone-50 px-3.5 py-1.5 text-[12px]">
              <span className="font-bold text-stone-400">{day}</span>
              <span className="text-stone-600">{plan}</span>
              <span className={slipped ? 'font-semibold text-amber-700' : 'text-stone-800'}>{did}</span>
            </div>
          ))}
        </div>

        {/* Observation → meaning → action. THE discovery. */}
        <div className="rounded-2xl bg-stone-900 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400">What the logs caught</p>
          <p className="mt-1.5 text-[15px] font-bold leading-snug text-white">
            They planned DILR on 4 days — and did it on 1.
          </p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-stone-300">
            Every time, Quant took its place. So their problem isn&apos;t study time —
            it&apos;s that their best hours keep going to the section they already like.
            <b className="text-white"> They never noticed. Their logs did.</b>
          </p>
          <div className="mt-3 rounded-xl bg-white/10 px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">So tomorrow</p>
            <p className="text-[12.5px] font-semibold text-white">Start with DILR — 45 minutes — before Quant gets the day.</p>
          </div>
        </div>

        {/* The ladder. Every rung is something the REAL engines do today —
            postLogInsight compares to yesterday, computePrescriptiveLine finds
            avoided sections at ~2 weeks, plan tasks make plan-vs-actual real.
            Nothing here promises a feature that doesn't exist. */}
        <div className="rounded-2xl border border-stone-200 bg-white p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">The more you log, the more it sees</p>
          <div className="mt-2 space-y-1.5 text-[12px] leading-relaxed">
            <p><b className="text-stone-900">2 logs</b><span className="text-stone-500"> — how today compared to yesterday</span></p>
            <p><b className="text-stone-900">1 week</b><span className="text-stone-500"> — which section you&apos;re quietly avoiding, and your Monday review</span></p>
            <p><b className="text-stone-900">2 weeks</b><span className="text-stone-500"> — your plan vs what you actually do</span></p>
          </div>
        </div>

        <p className="text-center text-[11px] text-stone-400">
          Both of those were samples. Yours start with your first real log — and the
          weekly one only appears once there is a real week behind it.
        </p>

        <div className="sticky bottom-0 z-20 bg-white/95 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
          <button
            onClick={() => finish(false)}
            disabled={isLoading}
            className="w-full rounded-2xl bg-stone-900 py-3.5 text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-60"
          >
            {isLoading ? 'Finishing up…' : 'Start my prep →'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
          {firstName ? `${firstName}, ` : ''}one last thing — try this
        </h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-stone-600">
          Every day you get 2–3 tasks like these on Home. After studying, tap the
          circle and pick how much you did — <b>that&apos;s it, done for the day</b>. No typing, no forms.
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
            Done — that&apos;s the whole log. 3 taps.
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-stone-300">
            Now the part that matters: what CareerRai can <b>do</b> with a week of these.
          </p>
        </div>
      ) : (
        <p className="text-center text-[11px] text-stone-400">
          This is just practice — nothing is saved. It counts for real from tomorrow.
        </p>
      )}

      <div className="sticky bottom-0 z-20 bg-white/95 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
        {allDone ? (
          <button
            onClick={reveal}
            disabled={isLoading}
            className="w-full rounded-2xl bg-stone-900 py-3.5 text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-60"
          >
            See what your logs unlock →
          </button>
        ) : (
          // The always-open exit. A tutorial may invite; it must never gate
          // (Incident #2) — completion goes through with zero practice taps.
          // But it is DEFERRAL, not "Skip": that word taught 79% of students
          // this screen was optional noise.
          <button
            onClick={() => finish(true)}
            disabled={isLoading}
            className="w-full rounded-2xl border border-stone-200 bg-white py-3 text-[13px] font-semibold text-stone-500 transition-all active:scale-[0.98] disabled:opacity-60"
          >
            {isLoading ? 'Finishing up…' : 'I&apos;ll learn this on my real plan →'}
          </button>
        )}
      </div>
    </div>
  );
}
