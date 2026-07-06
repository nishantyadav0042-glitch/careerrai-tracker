'use client';

import { CoverageMatrix } from '@/components/Analysis/CoverageMatrix';

interface Props {
  onNext: () => void;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

// Topic Coverage becomes part of onboarding, not a page discovered later —
// reuses the exact same CoverageMatrix component /student/analysis uses, so
// there's one seeding/persistence path, not two. First view is pre-filled
// from current_stage (the previous screen, already saved), so this is a
// review-and-correct step, not a 14-question survey.
export default function ScreenTopicCoverage({ onNext, onBack, canGoBack, isLoading }: Props) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-stone-600 leading-relaxed">
        Where you actually stand on every CAT topic — pre-filled from your stage above. Tap anything that&apos;s wrong.
      </p>
      <CoverageMatrix />
      <div className="flex gap-3 pt-2">
        {canGoBack && (
          <button onClick={onBack} className="flex-1 py-3 border border-stone-300 rounded-xl text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors">
            Back
          </button>
        )}
        <button
          onClick={onNext}
          disabled={isLoading}
          className="flex-1 py-3 rounded-xl font-semibold text-sm bg-orange-600 text-white hover:bg-orange-700 transition-all active:scale-[0.98] disabled:opacity-50"
        >
          Looks right →
        </button>
      </div>
    </div>
  );
}
