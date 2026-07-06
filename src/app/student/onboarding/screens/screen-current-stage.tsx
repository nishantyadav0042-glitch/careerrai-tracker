'use client';

import { cn } from '@/lib/utils';

type Stage = 'not_started' | 'concepts' | 'questions' | 'sectionals' | 'mocks';

interface Props {
  onNext: (data: { current_stage: Stage }) => void;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

const STAGE_OPTIONS: { value: Stage; label: string }[] = [
  { value: 'not_started', label: "Haven't started" },
  { value: 'concepts', label: 'Learning concepts' },
  { value: 'questions', label: 'Solving questions' },
  { value: 'sectionals', label: 'Taking sectionals' },
  { value: 'mocks', label: 'Taking full mocks' },
];

// Fixes phase being calendar-only — a student already at sectionals/mocks
// shouldn't get "concept + practice" framing just because their exam is
// still far off on the calendar.
export default function ScreenCurrentStage({ onNext, onBack, canGoBack, isLoading }: Props) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-stone-600 leading-relaxed">
        One tap — makes sure your Blueprint matches your real stage, not just the calendar.
      </p>
      <div>
        <label className="block text-xs font-semibold text-stone-500 uppercase tracking-widest mb-3">
          Where are you right now?
        </label>
        <div className="grid grid-cols-1 gap-2">
          {STAGE_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              disabled={isLoading}
              onClick={() => onNext({ current_stage: value })}
              className={cn(
                'rounded-xl border-2 border-stone-200 py-2.5 px-3 text-left text-sm font-semibold text-stone-700 hover:border-orange-400 hover:bg-orange-50 hover:text-orange-700 transition-all active:scale-95',
                isLoading && 'opacity-50'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {canGoBack && (
        <div className="flex gap-3 pt-2">
          <button onClick={onBack} className="flex-1 py-3 border border-stone-300 rounded-xl text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors">
            Back
          </button>
        </div>
      )}
    </div>
  );
}
