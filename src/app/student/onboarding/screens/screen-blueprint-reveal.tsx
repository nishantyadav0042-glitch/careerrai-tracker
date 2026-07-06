'use client';

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScreenBlueprintRevealProps {
  onNext: (data?: Record<string, unknown>) => Promise<void>;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

interface BlueprintSnapshot {
  phase: { label: string; weekRange: string; objective: string };
  weeksRemaining: number;
  weakestSection: string | null;
  weakTopic: string | null;
  targetPercentile: number | null;
  coverageTally: { not_started: number; started: number; completed: number; strong: number };
  blueprintConfidence: { score: number; reasons: string[] };
}

// The ownership moment — everything before this screen was building toward
// THIS: a real, already-generated Blueprint, not a "form submitted"
// acknowledgment. Every number here is the actual output of the engine
// (Roadmap phase, Topic Selector's focus pick, Blueprint confidence) —
// nothing on this screen is staged or fabricated for effect. A first-day
// confidence score in the 60s-70s is the honest number, not a bug — it
// climbs as real history accumulates (see blueprintConfidence.reasons).
export default function ScreenBlueprintReveal({ onNext, isLoading }: ScreenBlueprintRevealProps) {
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
        <p className="text-sm text-stone-600">Your Blueprint is built — head to your homepage to see it.</p>
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
        <p className="text-sm text-stone-500">Building your Blueprint…</p>
      </div>
    );
  }

  const coverageTotal = data.coverageTally.not_started + data.coverageTally.started + data.coverageTally.completed + data.coverageTally.strong;

  return (
    <div className="space-y-5">
      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-orange-600 mb-1">Your CAT Blueprint is ready</p>
        <h1 className="text-2xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
          This is yours now.
        </h1>
      </div>

      <div className="bg-white rounded-2xl border-2 border-orange-100 p-5 space-y-4">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold mb-1">Where you are</p>
          <p className="text-base font-bold text-stone-900">{data.phase.label} <span className="font-normal text-stone-400 text-sm">· {data.weeksRemaining}w to CAT</span></p>
          <p className="text-xs text-stone-500 mt-0.5">{data.phase.objective}</p>
        </div>

        {data.weakestSection && (
          <div className="border-t border-stone-100 pt-3">
            <p className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold mb-1">Your Blueprint&apos;s focus</p>
            <p className="text-sm font-semibold text-stone-800">{data.weakestSection}{data.weakTopic ? ` — ${data.weakTopic}` : ''}</p>
          </div>
        )}

        {coverageTotal > 0 && (
          <div className="border-t border-stone-100 pt-3 grid grid-cols-4 gap-2 text-center">
            {([
              ['New', data.coverageTally.not_started, 'text-stone-400'],
              ['Started', data.coverageTally.started, 'text-amber-600'],
              ['Done', data.coverageTally.completed, 'text-teal-600'],
              ['Strong', data.coverageTally.strong, 'text-orange-600'],
            ] as const).map(([label, count, color]) => (
              <div key={label}>
                <p className={cn('text-base font-bold', color)}>{count}</p>
                <p className="text-[9px] text-stone-400">{label}</p>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-stone-100 pt-3 flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold">Blueprint confidence</p>
            {data.blueprintConfidence.reasons[0] && (
              <p className="text-[11px] text-stone-500 mt-0.5 max-w-[220px]">{data.blueprintConfidence.reasons[0]}</p>
            )}
          </div>
          <p className="text-2xl font-bold text-stone-900 shrink-0">{data.blueprintConfidence.score}%</p>
        </div>
      </div>

      <p className="text-xs text-stone-500 text-center leading-relaxed">
        This isn&apos;t a template — it&apos;s built from what you just told us, and it changes every day as you study.
      </p>

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
