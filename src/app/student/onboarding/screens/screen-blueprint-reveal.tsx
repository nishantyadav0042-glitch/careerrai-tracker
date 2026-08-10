'use client';

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScreenBlueprintRevealProps {
  onNext: (data?: Record<string, unknown>) => Promise<void>;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
  successGoal?: string | null;
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
}

// The ownership moment — everything before this screen was building toward
// THIS: a real, already-generated Blueprint, not a "form submitted"
// acknowledgment. Every number here is the actual output of the engine
// (Roadmap phase, Topic Selector's focus pick, Blueprint confidence) —
// nothing on this screen is staged or fabricated for effect. A first-day
// confidence score in the 60s-70s is the honest number, not a bug — it
// climbs as real history accumulates (see blueprintConfidence.reasons).
export default function ScreenBlueprintReveal({ onNext, isLoading, successGoal = null }: ScreenBlueprintRevealProps) {
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
        <p className="text-sm text-stone-600">Your CAT Plan is built — head to Home to see it.</p>
        <button
          onClick={() => onNext({ onboardingCompleted: true })}
          disabled={isLoading}
          className="w-full py-3.5 bg-stone-900 text-white rounded-2xl font-semibold text-sm active:scale-[0.98] transition-all disabled:opacity-60"
        >
          {isLoading ? 'Finishing up…' : 'Start my prep →'}
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

  return (
    <div className="space-y-5">
      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-orange-600 mb-1">🎉 Your CAT Plan is ready</p>
        <h1 className="text-2xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
          This is yours now.
        </h1>
        {successGoal && SUCCESS_GOAL_LABEL[successGoal] && (
          <p className="mt-1.5 inline-block text-[11px] font-bold text-orange-700 bg-orange-50 border border-orange-200 rounded-full px-3 py-1">
            Built for your goal: {SUCCESS_GOAL_LABEL[successGoal]}
          </p>
        )}
      </div>

      <div className="bg-white rounded-2xl border-2 border-orange-100 p-5 space-y-4">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold mb-1">Where you are</p>
          <p className="text-base font-bold text-stone-900">{data.phase.label} <span className="font-normal text-stone-400 text-sm">· {data.weeksRemaining}w to CAT</span></p>
          <p className="text-xs text-stone-500 mt-0.5">{data.phase.objective}</p>
        </div>

        {data.weakestSection && (
          <div className="border-t border-stone-100 pt-3">
            <p className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold mb-1">Your plan&apos;s focus</p>
            <p className="text-sm font-semibold text-stone-800">{data.weakestSection}{data.weakTopic ? ` — ${data.weakTopic}` : ''}</p>
          </div>
        )}

        {coverageTotal > 0 && (
          <div className="border-t border-stone-100 pt-3 grid grid-cols-5 gap-1 text-center">
            {([
              ['⚪ New', data.coverageTally.not_started, 'text-stone-400'],
              ['🟡 Learning', data.coverageTally.learning, 'text-amber-600'],
              ['🔵 Practicing', data.coverageTally.practicing, 'text-blue-600'],
              ['🟠 Revising', data.coverageTally.revising, 'text-orange-600'],
              ['🟢 Ready', data.coverageTally.exam_ready, 'text-teal-600'],
            ] as const).map(([label, count, color]) => (
              <div key={label}>
                <p className={cn('text-base font-bold', color)}>{count}</p>
                <p className="text-[9px] text-stone-400">{label}</p>
              </div>
            ))}
          </div>
        )}

      </div>

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
          {isLoading ? 'Finishing up…' : 'Start my prep →'}
        </button>
      </div>
    </div>
  );
}
