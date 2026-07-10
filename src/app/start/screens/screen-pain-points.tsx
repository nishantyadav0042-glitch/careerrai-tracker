'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  onNext: (data?: Record<string, unknown>) => void;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

// The real, felt pains of a CAT aspirant — written so a student reads one and
// thinks "that's literally me," not a polite survey option. Each still maps to
// something CareerRai actually does (results→buddy mock analysis,
// consistency→routine+reminders, tracking→coverage map, finish→owned date,
// revision→revision cycle, mentor→1:1 IIM buddy) so the reassurance is honest.
export const PAINS: { id: string; label: string }[] = [
  { id: 'results', label: "I put in the hours but my mocks just won't improve" },
  { id: 'consistency', label: "I plan big on Sunday — by Wednesday it's dead" },
  { id: 'no_tracking', label: "I've lost track of what's done and what's left" },
  { id: 'finish', label: "I'm scared I won't finish the syllabus before CAT" },
  { id: 'revision', label: "I forget topics I studied just a month ago" },
  { id: 'no_mentor', label: "No one who's actually cracked CAT is guiding me" },
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
