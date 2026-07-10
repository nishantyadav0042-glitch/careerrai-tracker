'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  onNext: (data?: Record<string, unknown>) => void;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

export const PAINS: { id: string; label: string }[] = [
  { id: 'consistency', label: "I start strong and lose consistency within days" },
  { id: 'no_tracking', label: "I don't actually know what I've covered and what I haven't" },
  { id: 'no_plan', label: "I don't have a real day-by-day study plan" },
  { id: 'no_mentor', label: "I have no one senior checking in on me" },
];

// Choose exactly 2 — forces the honest top pain instead of a wishlist.
export default function ScreenPainPoints({ onNext, onBack, canGoBack, isLoading }: Props) {
  const [picked, setPicked] = useState<string[]>([]);

  const toggle = (id: string) => {
    setPicked((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : prev.length < 2 ? [...prev, id] : prev));
  };

  return (
    <div className="space-y-5 pt-1">
      <div>
        <h1 className="text-xl font-bold text-stone-900 leading-snug" style={{ fontFamily: 'Georgia, serif' }}>
          What&apos;s actually stopping you?
        </h1>
        <p className="mt-1.5 text-sm text-stone-500">Pick your top 2 — real ones, not the polite answer.</p>
      </div>

      <div className="space-y-2">
        {PAINS.map(({ id, label }) => {
          const isSelected = picked.includes(id);
          const rank = picked.indexOf(id) + 1;
          const disabled = !isSelected && picked.length >= 2;
          return (
            <button
              key={id}
              type="button"
              disabled={disabled}
              onClick={() => toggle(id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-2xl border-2 p-4 text-left transition-all active:scale-[0.98]',
                isSelected ? 'border-stone-900 bg-stone-50' : disabled ? 'border-stone-100 bg-stone-50 opacity-50' : 'border-stone-200 bg-white hover:border-stone-400'
              )}
            >
              <span className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold',
                isSelected ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 text-transparent'
              )}>
                {isSelected ? rank : ''}
              </span>
              <p className="text-sm font-medium leading-snug text-stone-800">{label}</p>
            </button>
          );
        })}
      </div>

      <div className="flex gap-3 pt-1">
        {canGoBack && (
          <button onClick={onBack} disabled={isLoading} className="flex-1 rounded-xl border border-stone-300 py-3 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50">
            Back
          </button>
        )}
        <button
          onClick={() => onNext({ pain_points: picked })}
          disabled={picked.length !== 2 || isLoading}
          className={cn(
            'flex-1 rounded-xl py-3 text-sm font-semibold transition-all active:scale-[0.98]',
            picked.length === 2 ? 'bg-stone-900 text-white hover:bg-stone-800' : 'cursor-not-allowed bg-stone-200 text-stone-400'
          )}
        >
          {picked.length < 2 ? `Pick ${2 - picked.length} more` : 'Continue →'}
        </button>
      </div>
    </div>
  );
}
