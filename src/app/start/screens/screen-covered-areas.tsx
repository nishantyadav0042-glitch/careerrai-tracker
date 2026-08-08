'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { QA_GROUPS, VERBAL_TOPICS, LRDI_TOPICS } from '@/lib/topics-constants';

// Stage A (founder, 8 Aug): the 46-topic tap-through is gone from signup.
// One question, 7 chips, done in 5 seconds — the fine-grained map still
// exists in the app ("What's done") for whenever the student wants to refine
// it. Fewest lifetime hours, not fewest clicks: asking once is an
// investment, but asking 46 things before showing any value is what the
// funnel data says kills day-1.
//
// The output is the SAME topic_matrix shape the old screen produced — every
// exam topic with a status — so the instant-insight screen, the signup
// replay (verify-phone-otp) and the coverage seeding all work unchanged.
// A tapped area marks its topics 'practicing'; everything else 'not_started'.

interface Props {
  onNext: (data?: Record<string, unknown>) => void;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
  onMatrixReady?: (matrix: { section: string; topic: string; status: 'not_started' | 'practicing' }[]) => void;
}

const AREAS: { key: string; label: string; section: 'QA' | 'VARC' | 'DILR'; topics: string[] }[] = [
  ...QA_GROUPS.map((g) => ({ key: g.label, label: g.label, section: 'QA' as const, topics: g.units })),
  { key: 'VARC', label: 'Reading & Verbal', section: 'VARC', topics: VERBAL_TOPICS },
  { key: 'DILR', label: 'DI & LR', section: 'DILR', topics: LRDI_TOPICS },
];

export default function ScreenCoveredAreas({ onNext, onBack, canGoBack, isLoading, onMatrixReady }: Props) {
  const [covered, setCovered] = useState<Set<string>>(new Set());

  const toggle = (key: string) => {
    setCovered((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const continueWith = (chosen: Set<string>) => {
    const matrix = AREAS.flatMap((a) =>
      a.topics.map((topic) => ({
        section: a.section,
        topic,
        status: (chosen.has(a.key) ? 'practicing' : 'not_started') as 'practicing' | 'not_started',
      }))
    );
    onMatrixReady?.(matrix);
    onNext({
      coverage_practicing: matrix.filter((m) => m.status === 'practicing').length,
      coverage_learning: 0,
    });
  };

  return (
    <div className="space-y-6 pt-1">
      <div>
        <h1 className="text-xl font-bold text-stone-900 leading-snug" style={{ fontFamily: 'Georgia, serif' }}>
          What have you already covered?
        </h1>
        <p className="mt-1.5 text-sm text-stone-500">Tap all that apply. Rough is fine — you can fix details later.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {AREAS.map((a) => {
          const active = covered.has(a.key);
          return (
            <button
              key={a.key}
              type="button"
              onClick={() => toggle(a.key)}
              className={cn(
                'rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all active:scale-95',
                active ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 bg-white text-stone-700 hover:border-stone-900'
              )}
            >
              {active ? '✓ ' : ''}{a.label}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        disabled={isLoading}
        onClick={() => continueWith(new Set())}
        className="w-full rounded-2xl border border-stone-300 bg-white py-3.5 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50"
      >
        Nothing yet — starting fresh
      </button>

      <div className="sticky bottom-0 z-20 flex gap-3 bg-white/95 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
        {canGoBack && (
          <button onClick={onBack} disabled={isLoading} className="flex-1 rounded-xl border border-stone-300 py-3 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50">
            Back
          </button>
        )}
        <button
          onClick={() => continueWith(covered)}
          disabled={isLoading || covered.size === 0}
          className={cn(
            'flex-1 rounded-xl py-3 text-sm font-semibold transition-all active:scale-[0.98]',
            covered.size > 0 ? 'bg-stone-900 text-white hover:bg-stone-800' : 'cursor-not-allowed bg-stone-200 text-stone-400'
          )}
        >
          Continue →
        </button>
      </div>
    </div>
  );
}
