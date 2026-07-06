'use client';

import { cn } from '@/lib/utils';

type Blocker = 'inconsistency' | 'dont_know_what' | 'mock_anxiety' | 'time_wasting';

interface Props {
  onNext: (data: { biggest_blocker: Blocker }) => void;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

const BLOCKER_OPTIONS: { value: Blocker; label: string }[] = [
  { value: 'inconsistency', label: "Can't stay consistent" },
  { value: 'dont_know_what', label: "Don't know what to study" },
  { value: 'mock_anxiety', label: 'Mocks scare me' },
  { value: 'time_wasting', label: 'I waste too much time' },
];

// Seeds the Mission Engine's cold-start bias — before any real behavioral
// signal exists, this is the only thing telling today's plan what to lead
// with.
export default function ScreenBiggestBlocker({ onNext, onBack, canGoBack, isLoading }: Props) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-stone-600 leading-relaxed">
        One tap — this shapes what your Blueprint leads with every day.
      </p>
      <div>
        <label className="block text-xs font-semibold text-stone-500 uppercase tracking-widest mb-3">
          What&apos;s your biggest blocker right now?
        </label>
        <div className="grid grid-cols-1 gap-2">
          {BLOCKER_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              disabled={isLoading}
              onClick={() => onNext({ biggest_blocker: value })}
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
