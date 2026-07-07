'use client';

import { cn } from '@/lib/utils';

// Identity, not engine input: one tap that the Blueprint hands back at the
// reveal ("Built for your goal: 99+ percentile"). A Blueprint labeled with
// the student's own definition of success belongs to them in a way a
// generic plan never can. "Still figuring it out" is a first-class answer —
// same honesty-over-flattery rule as the preparation map.
export type SuccessGoal = 'any_iim' | 'p95' | 'p99' | 'figuring_out';

export const SUCCESS_GOAL_LABEL: Record<SuccessGoal, string> = {
  any_iim: 'Just get into an IIM',
  p95: '95+ percentile',
  p99: '99+ percentile',
  figuring_out: 'Still figuring it out',
};

interface Props {
  onNext: (data?: Record<string, unknown>) => void;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

const OPTIONS: SuccessGoal[] = ['any_iim', 'p95', 'p99', 'figuring_out'];

export default function ScreenSuccessGoal({ onNext, onBack, canGoBack, isLoading }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-stone-600 leading-relaxed">
          Last question — and it&apos;s about you, not the syllabus.
        </p>
      </div>
      <div>
        <label className="block text-xs font-semibold text-stone-500 uppercase tracking-widest mb-3">
          What would success look like for you?
        </label>
        <div className="grid grid-cols-1 gap-2">
          {OPTIONS.map((value) => (
            <button
              key={value}
              disabled={isLoading}
              onClick={() => onNext({ success_goal: value })}
              className={cn(
                'rounded-xl border-2 border-stone-200 py-3 px-3 text-left text-sm font-semibold text-stone-700 hover:border-orange-400 hover:bg-orange-50 hover:text-orange-700 transition-all active:scale-95',
                isLoading && 'opacity-50'
              )}
            >
              {SUCCESS_GOAL_LABEL[value]}
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
