'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

const COLLEGES = [
  'IIM Ahmedabad', 'IIM Bangalore', 'IIM Calcutta',
  'IIM Lucknow', 'IIM Kozhikode', 'IIM Indore',
  'ISB Hyderabad', 'XLRI Jamshedpur', 'MDI Gurgaon',
  'IIFT Delhi', 'SP Jain Mumbai', 'JBIMS Mumbai',
  'FMS Delhi', 'IIM Shillong', 'IIM Udaipur',
];

const PERCENTILES = [90, 92, 94, 96, 98, 99];

interface Props {
  onNext: (data?: Record<string, unknown>) => void;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

export default function ScreenDreamPercentile({ onNext, onBack, canGoBack, isLoading }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [percentile, setPercentile] = useState<number | null>(null);

  const toggle = (college: string) => {
    setSelected((prev) => (prev.includes(college) ? prev.filter((c) => c !== college) : [...prev, college].slice(0, 3)));
  };

  const canContinue = selected.length > 0 && percentile != null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-stone-900 leading-snug" style={{ fontFamily: 'Georgia, serif' }}>
          Your dream colleges. Your target percentile.
        </h1>
        <p className="mt-1.5 text-sm text-stone-500">Pick up to 3 colleges you actually want, and the percentile you&apos;re aiming for.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {COLLEGES.map((college) => {
          const isSelected = selected.includes(college);
          const rank = selected.indexOf(college) + 1;
          return (
            <button
              key={college}
              type="button"
              onClick={() => toggle(college)}
              disabled={!isSelected && selected.length >= 3}
              className={cn(
                'relative rounded-xl border px-3 py-2 text-sm font-medium transition-all active:scale-95',
                isSelected
                  ? 'border-stone-900 bg-stone-900 text-white shadow-md'
                  : selected.length >= 3
                  ? 'cursor-not-allowed border-stone-200 bg-stone-100 text-stone-400'
                  : 'border-stone-300 bg-white text-stone-700 hover:border-stone-900'
              )}
            >
              {isSelected && (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-stone-900 text-[9px] font-bold text-white ring-2 ring-white">
                  {rank}
                </span>
              )}
              {college}
            </button>
          );
        })}
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-stone-800">Target percentile</p>
        <div className="flex flex-wrap gap-2">
          {PERCENTILES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPercentile(p)}
              className={cn(
                'rounded-xl border px-4 py-2 text-sm font-semibold transition-all active:scale-95',
                percentile === p ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 bg-white text-stone-700 hover:border-stone-900'
              )}
            >
              {p}+
            </button>
          ))}
        </div>
      </div>

      {/* Sticky CTA: pins to the viewport bottom when content pushes it below
          the fold (founder: "I have to scroll to tap Continue"), flows inline
          on short screens. */}
      <div className="sticky bottom-0 z-20 flex gap-3 bg-white/95 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
        {canGoBack && (
          <button onClick={onBack} disabled={isLoading} className="flex-1 rounded-xl border border-stone-300 py-3 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50">
            Back
          </button>
        )}
        <button
          onClick={() => onNext({ dream_colleges: selected, target_percentile: percentile })}
          disabled={!canContinue || isLoading}
          className={cn(
            'flex-1 rounded-xl py-3 text-sm font-semibold transition-all active:scale-[0.98]',
            canContinue ? 'bg-stone-900 text-white hover:bg-stone-800' : 'cursor-not-allowed bg-stone-200 text-stone-400'
          )}
        >
          Continue →
        </button>
      </div>
    </div>
  );
}
