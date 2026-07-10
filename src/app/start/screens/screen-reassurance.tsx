'use client';

import { PAINS } from './screen-pain-points';

interface Props {
  onNext: (data?: Record<string, unknown>) => void;
  isLoading: boolean;
  painPoints: string[];
}

// Interstitial between the pain-point picker and the topic mapping —
// converts what they just admitted into "here's exactly what we do about
// it" before asking for more effort.
export default function ScreenReassurance({ onNext, isLoading, painPoints }: Props) {
  const labels = painPoints.map((id) => PAINS.find((p) => p.id === id)?.label).filter(Boolean);

  return (
    <div className="space-y-6 pt-4 text-center">
      <div>
        <h1 className="text-2xl font-bold text-stone-900 leading-snug" style={{ fontFamily: 'Georgia, serif' }}>
          No worries. We&apos;ll solve this — free.
        </h1>
        {labels.length > 0 && (
          <p className="mt-3 text-sm leading-relaxed text-stone-500">
            {labels.join(' and ')}
            {' '}— that&apos;s exactly what a daily plan, honest tracking, and a real IIM buddy are built to fix.
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 text-left">
        <p className="text-xs font-semibold text-stone-500">Next: map what you already know</p>
        <p className="mt-1 text-sm text-stone-700">A few taps across your syllabus — so the plan starts where you actually are, not from zero.</p>
      </div>

      <button
        type="button"
        disabled={isLoading}
        onClick={() => onNext()}
        className="w-full rounded-2xl bg-stone-900 py-4 text-sm font-semibold text-white transition-all hover:bg-stone-800 active:scale-[0.98]"
      >
        Let&apos;s map it →
      </button>
    </div>
  );
}
