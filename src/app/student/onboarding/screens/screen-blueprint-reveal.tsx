'use client';

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';

interface ScreenBlueprintRevealProps {
  onNext: (data?: Record<string, unknown>) => Promise<void>;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
  successGoal?: string | null;
  firstName?: string | null;
}

const SUCCESS_GOAL_LABEL: Record<string, string> = {
  any_iim: 'Get into an IIM',
  p95: '95+ percentile',
  p99: '99+ percentile',
  figuring_out: 'Finding your target',
};

interface BlueprintSnapshot {
  phase: { label: string; weekRange: string; objective: string };
  attemptYear: number | null;
  weeksRemaining: number;
  weakestSection: string | null;
  weakTopic: string | null;
  targetPercentile: number | null;
  coverageTally: { not_started: number; learning: number; practicing: number; revising: number; exam_ready: number };
  blueprintConfidence: { score: number; reasons: string[] };
  totalTopics: number;
  daysToExam: number;
  mocksPerWeekNow: number;
  mocksPerWeekRisesTo: number | null;
  studyTargetHoursPerDay: number | null;
  finishProjection: { status: 'done' | 'stalled' | 'ahead' | 'tight' | 'critical'; windowLabel: string | null; sub: string };
}

// The finish-projection engine's own verdict, styled — never a re-derived
// number. A fixed slack-day count from the original mock would mean computing
// a NEW statistic outside study-plan.ts, the one module that owns this math
// (docs/CODEMAP.md: "do not add a fourth planner"). The engine's real `sub`
// line says the same kind of thing honestly, for whatever the student's
// actual pace is today.
const FIT_STYLE: Record<BlueprintSnapshot['finishProjection']['status'], { bg: string; icon: string }> = {
  done: { bg: '#0F766E', icon: '✓' },
  ahead: { bg: '#0F766E', icon: '✓' },
  tight: { bg: '#C2410C', icon: '⚡' },
  critical: { bg: '#B91C1C', icon: '⚠' },
  stalled: { bg: '#44403C', icon: '○' },
};

// The ownership moment — everything before this screen was building toward
// THIS: a real, already-generated Blueprint, not a "form submitted"
// acknowledgment. Every number here is the actual output of the engine
// (Roadmap phase, Topic Selector's focus pick, Blueprint confidence) —
// nothing on this screen is staged or fabricated for effect. A first-day
// confidence score in the 60s-70s is the honest number, not a bug — it
// climbs as real history accumulates (see blueprintConfidence.reasons).
export default function ScreenBlueprintReveal({ onNext, isLoading, successGoal = null, firstName = null }: ScreenBlueprintRevealProps) {
  const [data, setData] = useState<BlueprintSnapshot | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/blueprint');
        if (!res.ok) { setLoadError(true); return; }
        setData(await res.json());
      } catch {
        setLoadError(true);
      }
    })();
  }, []);

  if (loadError) {
    // Never block onboarding completion on this one read — the Blueprint
    // itself is already generated server-side regardless of whether this
    // summary fetch succeeded.
    return (
      <div className="space-y-6 text-center py-8">
        <p className="text-sm text-stone-600">Your CAT Plan is built and waiting on Home.</p>
        <button
          onClick={() => onNext({ onboardingCompleted: true })}
          disabled={isLoading}
          className="w-full py-3.5 bg-stone-900 text-white rounded-2xl font-semibold text-sm active:scale-[0.98] transition-all disabled:opacity-60"
        >
          {isLoading ? 'Finishing up…' : 'Continue →'}
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <Sparkles className="w-8 h-8 text-orange-500 animate-pulse" />
        <p className="text-sm text-stone-500">Building your CAT Plan…</p>
      </div>
    );
  }

  const coverageTotal = data.coverageTally.not_started + data.coverageTally.learning + data.coverageTally.practicing + data.coverageTally.revising + data.coverageTally.exam_ready;
  const fit = FIT_STYLE[data.finishProjection.status];
  // The ring's sweep — a fraction of a full circle, capped so a fresh 46-week
  // countdown never reads as "almost none of the way there" on day one; the
  // days number itself (not the ring) carries the real information.
  const ringPct = Math.max(0.04, Math.min(1, 1 - data.daysToExam / 240));

  return (
    <div className="space-y-5">
      {/* S1 — the reveal hero. Every number on it is real: daysToExam,
          mocksPerWeekNow/RisesTo and studyTargetHoursPerDay are additive
          fields on /api/blueprint (13 Aug) built from the exact same
          exam-calendar/study-plan values the rest of the route already
          computes — nothing here is invented for the visual. */}
      <div className="overflow-hidden rounded-3xl bg-stone-900 p-5 text-white">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-orange-400">Your CAT Blueprint</p>
        <h1 className="mt-1 text-[22px] font-bold leading-tight" style={{ fontFamily: 'Georgia, serif' }}>
          {firstName ? `${firstName}, your plan is ready.` : 'Your plan is ready.'}
        </h1>
        <p className="mt-1 text-[12.5px] text-stone-300">
          {data.totalTopics} topics, sized to your hours, your coverage, your exam date.
        </p>
        {successGoal && SUCCESS_GOAL_LABEL[successGoal] && (
          <p className="mt-2 inline-block rounded-full border border-orange-400/40 bg-orange-400/10 px-3 py-1 text-[11px] font-bold text-orange-300">
            Built for your goal: {SUCCESS_GOAL_LABEL[successGoal]}
          </p>
        )}

        <div
          className="mx-auto mt-4 grid h-[118px] w-[118px] place-items-center rounded-full"
          style={{ background: `conic-gradient(#EA580C 0 ${ringPct * 360}deg, rgba(255,255,255,.12) ${ringPct * 360}deg 360deg)` }}
        >
          <div className="grid h-24 w-24 place-items-center rounded-full bg-stone-900 text-center">
            <div>
              <p className="text-[22px] font-extrabold leading-none">{data.daysToExam}</p>
              <p className="mt-1 text-[9px] tracking-[0.08em] text-stone-400">DAYS TO CAT</p>
            </div>
          </div>
        </div>

        <div className="mt-3.5 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.06] p-2.5">
            <p className="text-[9px] uppercase tracking-wide text-stone-400">Phase</p>
            <p className="mt-0.5 text-[13.5px] font-bold leading-tight">{data.phase.label}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.06] p-2.5">
            <p className="text-[9px] uppercase tracking-wide text-stone-400">Your focus</p>
            <p className="mt-0.5 truncate text-[13.5px] font-bold leading-tight">
              {data.weakestSection ?? 'All 3 sections'}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.06] p-2.5">
            <p className="text-[9px] uppercase tracking-wide text-stone-400">Syllabus done by</p>
            <p className="mt-0.5 text-[13.5px] font-bold leading-tight">
              {data.finishProjection.windowLabel ?? (data.finishProjection.status === 'done' ? 'Done' : '—')}
            </p>
            {data.studyTargetHoursPerDay != null && (
              <p className="text-[9.5px] text-stone-400">at your {data.studyTargetHoursPerDay}h/day</p>
            )}
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.06] p-2.5">
            <p className="text-[9px] uppercase tracking-wide text-stone-400">Mocks</p>
            <p className="mt-0.5 text-[13.5px] font-bold leading-tight">{data.mocksPerWeekNow} / week</p>
            {data.mocksPerWeekRisesTo != null && (
              <p className="text-[9.5px] text-stone-400">{data.mocksPerWeekRisesTo}/week from October</p>
            )}
          </div>
        </div>

        <div className="mt-3 rounded-xl px-3 py-2.5 text-[12px] font-semibold" style={{ background: fit.bg }}>
          {fit.icon} {data.finishProjection.sub}
        </div>

        {coverageTotal > 0 && (
          <div className="mt-3.5 border-t border-white/10 pt-3 grid grid-cols-5 gap-1 text-center">
            {([
              ['New', data.coverageTally.not_started],
              ['Learning', data.coverageTally.learning],
              ['Practicing', data.coverageTally.practicing],
              ['Revising', data.coverageTally.revising],
              ['Ready', data.coverageTally.exam_ready],
            ] as const).map(([label, count]) => (
              <div key={label}>
                <p className="text-[13.5px] font-bold">{count}</p>
                <p className="text-[8.5px] text-stone-400">{label}</p>
              </div>
            ))}
          </div>
        )}

        <p className="mt-3 text-center text-[10px] text-stone-500">Recalculated every day from what you actually cover.</p>
      </div>

      {data.weakestSection && (
        <div className="rounded-2xl border-2 border-orange-100 bg-white p-4">
          <p className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold mb-1">Your plan&apos;s focus</p>
          <p className="text-sm font-semibold text-stone-800">{data.weakestSection}{data.weakTopic ? ` — ${data.weakTopic}` : ''}</p>
        </div>
      )}

      {/* The deal, said loudly (founder, 10 Aug): we carry six jobs, the
          student carries one. Every line is a real live system, not a promise. */}
      <div className="rounded-2xl border-2 border-stone-900 bg-white p-5">
        <p className="text-center text-[11px] font-bold uppercase tracking-widest text-stone-500">
          From today, CareerRai does <span className="text-orange-600">6 things</span> for you
        </p>
        <div className="mt-3 space-y-2">
          {([
            'Builds your day — all 3 sections, sized to your hours',
            'Tracks your syllabus, topic by topic',
            'Schedules your mocks + all-November revision',
            'Guards your finish date — honestly, every week',
            'Reminds you, recovers missed days, protects your streak',
            'Re-plans tomorrow from what you actually did today',
          ] as const).map((job, i) => (
            <div key={job} className="flex items-start gap-2.5">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-stone-900 text-[10px] font-bold text-white">{i + 1}</span>
              <p className="text-[13px] leading-snug text-stone-700">{job}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-xl bg-orange-500 px-4 py-3 text-center">
          <p className="text-[11px] font-bold uppercase tracking-widest text-orange-100">You do 1 thing</p>
          <p className="text-xl font-extrabold text-white" style={{ fontFamily: 'Georgia, serif' }}>Study.</p>
        </div>
      </div>

      {/* Not an ending — a journey that has already started. Every line is
          real: today's mission exists (routine generates on first homepage
          load), tomorrow regenerates from tonight's state, the weekly
          evolution runs every week, and the finish line is their own CAT. */}
      <div className="bg-stone-900 rounded-2xl p-4 space-y-2">
        {([
          ['Today', 'Mission 1 ready', '✓'],
          ['Tomorrow', 'Already planned', '✓'],
          ['Every Sunday', 'Weekly review', '✓'],
          [data.attemptYear ? `November ${data.attemptYear}` : 'CAT day', 'CAT ready', '🏁'],
        ] as const).map(([when, what, mark]) => (
          <div key={when} className="flex items-center justify-between">
            <span className="text-xs text-stone-400 w-24 shrink-0">{when}</span>
            <span className="text-xs font-semibold text-white flex-1">{what}</span>
            <span className="text-xs">{mark}</span>
          </div>
        ))}
      </div>

      <div className="text-center">
        <p className="text-sm font-semibold leading-snug text-stone-800">
          From today, you don&apos;t have to guess your CAT preparation anymore.
        </p>
      </div>

      <div className="sticky bottom-0 z-20 bg-white/95 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
        <button
          onClick={() => onNext({ onboardingCompleted: true })}
          disabled={isLoading}
          className="w-full py-3.5 bg-stone-900 text-white rounded-2xl font-semibold text-sm active:scale-[0.98] transition-all disabled:opacity-60"
        >
          {isLoading ? 'Finishing up…' : 'See Day 1 of my plan →'}
        </button>
      </div>
    </div>
  );
}
