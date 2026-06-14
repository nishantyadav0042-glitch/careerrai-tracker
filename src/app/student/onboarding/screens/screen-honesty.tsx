'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  onNext: (data: {
    is_repeater: boolean;
    starting_percentile: number | null;
    hours_available: number;
  }) => void;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

const HOUR_OPTIONS = [1, 2, 3, 4, 5, 6];

export default function ScreenHonesty({ onNext, onBack, canGoBack, isLoading }: Props) {
  const [isRepeater, setIsRepeater] = useState<boolean | null>(null);
  const [percentile, setPercentile] = useState<number>(50);
  const [hoursAvailable, setHoursAvailable] = useState<number | null>(null);

  const isValid = isRepeater !== null && hoursAvailable !== null;

  return (
    <div className="space-y-6">
      <p className="text-sm text-stone-600 leading-relaxed">
        Honest baselines make honest progress. No one else sees this — it&apos;s just the data the app needs to give you accurate feedback.
      </p>

      {/* Repeater / Fresher */}
      <div>
        <label className="block text-xs font-semibold text-stone-500 uppercase tracking-widest mb-3">
          Is this your first attempt?
        </label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'First attempt', sub: 'Fresher to CAT', value: false },
            { label: 'Repeating', sub: 'Gave CAT before', value: true },
          ].map(({ label, sub, value }) => (
            <button
              key={label}
              onClick={() => setIsRepeater(value)}
              className={cn(
                'py-4 px-3 rounded-xl border-2 text-left transition-all active:scale-95',
                isRepeater === value
                  ? 'border-orange-500 bg-orange-50'
                  : 'border-stone-200 bg-white hover:border-stone-300'
              )}
            >
              <p className={cn('text-sm font-semibold', isRepeater === value ? 'text-orange-700' : 'text-stone-800')}>{label}</p>
              <p className="text-xs text-stone-500 mt-0.5">{sub}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Starting percentile (show only if repeater) */}
      {isRepeater === true && (
        <div>
          <label className="block text-xs font-semibold text-stone-500 uppercase tracking-widest mb-2">
            Your best CAT percentile so far
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={99}
              value={percentile}
              onChange={(e) => setPercentile(Number(e.target.value))}
              className="flex-1 accent-orange-600"
            />
            <span className="text-lg font-bold text-stone-900 w-14 text-right">{percentile}%ile</span>
          </div>
          <p className="text-xs text-stone-500 mt-1">
            {percentile >= 90
              ? 'So close. The gap between 90 and 99 is real — this app helps bridge it.'
              : percentile >= 70
              ? 'Good foundation. Consistency and section strategy will move this fast.'
              : 'Starting from a real place — that\'s the only honest starting point.'}
          </p>
        </div>
      )}

      {/* Hours available */}
      <div>
        <label className="block text-xs font-semibold text-stone-500 uppercase tracking-widest mb-3">
          Realistic study hours per day
        </label>
        <div className="grid grid-cols-6 gap-1.5">
          {HOUR_OPTIONS.map((h) => (
            <button
              key={h}
              onClick={() => setHoursAvailable(h)}
              className={cn(
                'py-3 rounded-xl font-bold text-sm transition-all active:scale-95 border-2',
                hoursAvailable === h
                  ? 'border-orange-500 bg-orange-50 text-orange-700'
                  : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300'
              )}
            >
              {h}h
            </button>
          ))}
        </div>
        <p className="text-xs text-stone-500 mt-2">
          {hoursAvailable && hoursAvailable <= 2
            ? 'Tight but workable — quality over quantity, every day.'
            : hoursAvailable && hoursAvailable >= 5
            ? 'Ambitious. The app will flag if you drop below this consistently.'
            : hoursAvailable
            ? 'Solid. That\'s enough to move the needle if the hours are focused.'
            : 'Be honest — this sets your daily target, not a promise.'}
        </p>
      </div>

      <div className="flex gap-3 pt-2">
        {canGoBack && (
          <button onClick={onBack} className="flex-1 py-3 border border-stone-300 rounded-xl text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors">
            Back
          </button>
        )}
        <button
          onClick={() =>
            isValid &&
            onNext({
              is_repeater: isRepeater!,
              starting_percentile: isRepeater ? percentile : null,
              hours_available: hoursAvailable!,
            })
          }
          disabled={!isValid || isLoading}
          className={cn(
            'flex-1 py-3 rounded-xl font-semibold text-sm transition-all active:scale-[0.98]',
            isValid ? 'bg-orange-600 text-white hover:bg-orange-700' : 'bg-stone-200 text-stone-400 cursor-not-allowed'
          )}
        >
          {isLoading ? 'Saving…' : 'That\'s honest →'}
        </button>
      </div>
    </div>
  );
}
