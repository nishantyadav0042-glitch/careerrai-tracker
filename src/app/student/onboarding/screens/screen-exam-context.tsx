'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  onNext: (data: {
    is_repeater: boolean;
    category: string;
    exam_target: string;
    attempt_year: number;
    target_percentile: number;
    last_year_percentile: number | null;
    had_buddy_last_year: boolean | null;
  }) => void;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

const CATEGORY_OPTIONS = ['General', 'OBC', 'SC', 'ST', 'EWS'];
const EXAM_OPTIONS = ['CAT', 'XAT', 'NMAT', 'Other'];
// Never offer a year that's already passed — a hardcoded list drifts stale.
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2];

export default function ScreenExamContext({ onNext, onBack, canGoBack, isLoading }: Props) {
  const [isRepeater, setIsRepeater] = useState<boolean | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [examTarget, setExamTarget] = useState<string | null>(null);
  const [attemptYear, setAttemptYear] = useState<number | null>(null);
  const [targetPercentile, setTargetPercentile] = useState<string>('');
  // Repeater-only (founder, 23 Jul): asked of EVERY repeater — last year's
  // real percentile, and whether they had a real buddy/mentor last year who
  // has themselves cracked CAT. Feeds the repeater-only buddy pitch right
  // after the commitment screen.
  const [lastYearPercentile, setLastYearPercentile] = useState<string>('');
  const [hadBuddyLastYear, setHadBuddyLastYear] = useState<boolean | null>(null);

  const parsedPercentile = parseFloat(targetPercentile);
  const percentileValid =
    targetPercentile.trim() !== '' &&
    !isNaN(parsedPercentile) &&
    parsedPercentile >= 50 &&
    parsedPercentile <= 99.99;

  const parsedLastYearPercentile = parseFloat(lastYearPercentile);
  const lastYearPercentileValid =
    lastYearPercentile.trim() !== '' &&
    !isNaN(parsedLastYearPercentile) &&
    parsedLastYearPercentile >= 0 &&
    parsedLastYearPercentile <= 99.99;

  const repeaterQuestionsValid = isRepeater !== true || (lastYearPercentileValid && hadBuddyLastYear !== null);

  const isValid =
    isRepeater !== null &&
    category !== null &&
    examTarget !== null &&
    attemptYear !== null &&
    percentileValid &&
    repeaterQuestionsValid;

  const handleNext = () => {
    if (!isValid) return;
    onNext({
      is_repeater: isRepeater!,
      category: category!,
      exam_target: examTarget!,
      attempt_year: attemptYear!,
      target_percentile: parsedPercentile,
      last_year_percentile: isRepeater ? parsedLastYearPercentile : null,
      had_buddy_last_year: isRepeater ? hadBuddyLastYear : null,
    });
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-stone-600 leading-relaxed">
        Honest context = accurate tracking. The app uses this to calibrate, not to judge.
      </p>

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
              <p className={cn('text-sm font-semibold', isRepeater === value ? 'text-orange-700' : 'text-stone-800')}>
                {label}
              </p>
              <p className="text-xs text-stone-500 mt-0.5">{sub}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Repeater-only follow-up (founder, 23 Jul): asked of every repeater —
          the real percentile they scored, and whether they had genuine
          expert support. Sets up the buddy-pitch screen right after this. */}
      {isRepeater === true && (
        <div className="space-y-4 rounded-2xl border border-orange-100 bg-orange-50/50 p-4">
          <div>
            <label className="block text-xs font-semibold text-stone-500 uppercase tracking-widest mb-2">
              What was your percentile last year?
            </label>
            <div className="relative">
              <input
                type="number"
                min={0}
                max={99.99}
                step={0.01}
                placeholder="e.g. 82.5"
                value={lastYearPercentile}
                onChange={(e) => setLastYearPercentile(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-stone-200 text-stone-900 text-lg font-medium focus:outline-none focus:ring-2 focus:ring-orange-400 appearance-none"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 text-sm font-medium">%ile</span>
            </div>
            {lastYearPercentile.trim() !== '' && !lastYearPercentileValid && (
              <p className="text-xs text-red-600 mt-1">Enter a percentile between 0 and 99.99.</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-500 uppercase tracking-widest mb-3">
              Did you have a buddy or guide last year — someone who has actually cracked CAT?
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Yes, I did', value: true },
                { label: 'No, I was alone', value: false },
              ].map(({ label, value }) => (
                <button
                  key={label}
                  onClick={() => setHadBuddyLastYear(value)}
                  className={cn(
                    'py-3 px-3 rounded-xl border-2 text-sm font-medium transition-all active:scale-95',
                    hadBuddyLastYear === value
                      ? 'border-orange-500 bg-orange-50 text-orange-700'
                      : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-stone-500 uppercase tracking-widest mb-3">
          Category
        </label>
        <div className="flex flex-wrap gap-2">
          {CATEGORY_OPTIONS.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={cn(
                'px-4 py-2 rounded-xl text-sm font-medium border-2 transition-all active:scale-95',
                category === c
                  ? 'border-orange-500 bg-orange-50 text-orange-700'
                  : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300'
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-stone-500 uppercase tracking-widest mb-3">
          Target exam
        </label>
        <div className="flex flex-wrap gap-2">
          {EXAM_OPTIONS.map((e) => (
            <button
              key={e}
              onClick={() => setExamTarget(e)}
              className={cn(
                'px-4 py-2 rounded-xl text-sm font-medium border-2 transition-all active:scale-95',
                examTarget === e
                  ? 'border-orange-500 bg-orange-50 text-orange-700'
                  : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300'
              )}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-stone-500 uppercase tracking-widest mb-3">
          Attempt year
        </label>
        <div className="flex gap-2">
          {YEAR_OPTIONS.map((y) => (
            <button
              key={y}
              onClick={() => setAttemptYear(y)}
              className={cn(
                'flex-1 py-2 rounded-xl text-sm font-medium border-2 transition-all active:scale-95',
                attemptYear === y
                  ? 'border-orange-500 bg-orange-50 text-orange-700'
                  : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300'
              )}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-stone-500 uppercase tracking-widest mb-2">
          Target percentile
        </label>
        <div className="relative">
          <input
            type="number"
            min={50}
            max={99.99}
            step={0.01}
            placeholder="99.5"
            value={targetPercentile}
            onChange={(e) => setTargetPercentile(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-stone-200 text-stone-900 text-lg font-medium focus:outline-none focus:ring-2 focus:ring-orange-400 appearance-none"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 text-sm font-medium">%ile</span>
        </div>
        {targetPercentile.trim() !== '' && !percentileValid && (
          <p className="text-xs text-red-600 mt-1">Enter a percentile between 50 and 99.99.</p>
        )}
      </div>

      <div className="sticky bottom-0 z-20 flex gap-3 bg-white/95 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
        {canGoBack && (
          <button
            onClick={onBack}
            className="flex-1 py-3 border border-stone-300 rounded-xl text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors"
          >
            Back
          </button>
        )}
        <button
          onClick={handleNext}
          disabled={!isValid || isLoading}
          className={cn(
            'flex-1 py-3 rounded-xl font-semibold text-sm transition-all active:scale-[0.98]',
            isValid ? 'bg-orange-600 text-white hover:bg-orange-700' : 'bg-stone-200 text-stone-400 cursor-not-allowed'
          )}
        >
          {isLoading ? 'Saving…' : 'Continue →'}
        </button>
      </div>
    </div>
  );
}
