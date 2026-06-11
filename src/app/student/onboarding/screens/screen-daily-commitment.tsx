'use client';

import { useState } from 'react';
import { Target } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScreenDailyCommitmentProps {
  onNext: (data?: Record<string, unknown>) => Promise<void>;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

const COMMITMENT_OPTIONS = [
  { label: '1 hour', value: 1, description: 'Starting out' },
  { label: '1.5 hours', value: 1.5, description: 'Moderate' },
  { label: '2 hours', value: 2, description: 'Recommended', isDefault: true },
  { label: '3 hours', value: 3, description: 'Serious prep' },
  { label: '4 hours', value: 4, description: 'Intensive' },
  { label: '5+ hours', value: 5, description: 'Full-time' }
];

export default function ScreenDailyCommitment({ onNext, onBack, canGoBack, isLoading }: ScreenDailyCommitmentProps) {
  const [selected, setSelected] = useState<number>(2); // Default 2 hours

  return (
    <div className="space-y-6">
      {/* Subtitle */}
      <div>
        <p className="text-sm text-orange-600 font-semibold uppercase tracking-wider">One Honest Question</p>
        <p className="text-xs text-stone-500 mt-1">This becomes your daily target</p>
      </div>

      {/* Question */}
      <div className="bg-gradient-to-br from-orange-50 to-white rounded-2xl p-6 border border-orange-100">
        <h3 className="text-lg font-bold text-stone-900 text-center mb-2">
          How many hours can you realistically study on a typical weekday?
        </h3>
        <p className="text-sm text-stone-600 text-center">
          Be honest. This becomes your streak target. Your buddy will notice if you consistently miss it.
        </p>
      </div>

      {/* Hour Picker */}
      <div className="grid grid-cols-2 gap-3">
        {COMMITMENT_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setSelected(option.value);
            }}
            type="button"
            className={cn(
              'p-4 rounded-xl transition-all border-2 text-center',
              selected === option.value
                ? 'bg-orange-600 border-orange-600 text-white shadow-lg'
                : 'bg-white border-stone-200 text-stone-900 hover:border-stone-300'
            )}
          >
            <div className="text-lg font-bold">{option.label}</div>
            <div className={cn('text-xs mt-1', selected === option.value ? 'text-orange-100' : 'text-stone-500')}>
              {option.description}
            </div>
          </button>
        ))}
      </div>

      {/* Info Message */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex gap-2">
          <Target className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-800">
            <span className="font-semibold">Your buddy checks your streak every Monday.</span> They&apos;ll notice if you&apos;re
            consistently hitting or missing your target.
          </p>
        </div>
      </div>

      {/* Context */}
      <p className="text-xs text-stone-500 text-center italic">
        Most successful students study 2-3 hours daily during prep season. Quality over quantity.
      </p>

      {/* Submit Button */}
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onNext({ studyTargetHours: selected });
        }}
        disabled={isLoading}
        type="button"
        className="w-full py-3 bg-orange-600 text-white rounded-xl font-medium hover:bg-orange-700 transition-all disabled:opacity-50 active:scale-[0.98] cursor-pointer"
      >
        This is my commitment
      </button>
    </div>
  );
}
