'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { QUANT_TOPICS, VERBAL_TOPICS, LRDI_TOPICS } from '@/lib/topics-constants';

type Section = 'VARC' | 'DILR' | 'QA';

interface Props {
  onNext: (data: { weakest_section: Section; weak_topic: string | null }) => void;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

const TOPICS_BY_SECTION: Record<Section, string[]> = {
  VARC: VERBAL_TOPICS,
  DILR: LRDI_TOPICS,
  QA: QUANT_TOPICS,
};

// Two taps, one screen slot in the wizard — this is the single highest-
// leverage input to the whole engine (Topic Selector's self-report bonus,
// Mission Engine's weak-section bias), so it belongs inside Blueprint
// generation itself, not a separate gate discovered later on the homepage.
export default function ScreenWeakFocus({ onNext, onBack, canGoBack, isLoading }: Props) {
  const [section, setSection] = useState<Section | null>(null);

  if (!section) {
    return (
      <div className="space-y-6">
        <p className="text-sm text-stone-600 leading-relaxed">
          One tap — this shapes today&apos;s routine and where your Blueprint spends the most time.
        </p>
        <div>
          <label className="block text-xs font-semibold text-stone-500 uppercase tracking-widest mb-3">
            Which section is toughest for you?
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(['VARC', 'DILR', 'QA'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSection(s)}
                className="rounded-xl border-2 border-stone-200 py-4 text-sm font-bold text-stone-700 hover:border-orange-400 hover:bg-orange-50 hover:text-orange-700 transition-all active:scale-95"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          {canGoBack && (
            <button onClick={onBack} className="flex-1 py-3 border border-stone-300 rounded-xl text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors">
              Back
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-stone-600 leading-relaxed">
        This is what makes today&apos;s tasks specific, not generic.
      </p>
      <div>
        <label className="block text-xs font-semibold text-stone-500 uppercase tracking-widest mb-3">
          Which part of {section} is toughest?
        </label>
        <div className="grid grid-cols-2 gap-2">
          {TOPICS_BY_SECTION[section].map((t) => (
            <button
              key={t}
              disabled={isLoading}
              onClick={() => onNext({ weakest_section: section, weak_topic: t })}
              className={cn(
                'rounded-xl border-2 border-stone-200 py-2.5 px-2 text-xs font-semibold text-stone-700 hover:border-orange-400 hover:bg-orange-50 hover:text-orange-700 transition-all active:scale-95',
                isLoading && 'opacity-50'
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <button
          onClick={() => onNext({ weakest_section: section, weak_topic: null })}
          disabled={isLoading}
          className="mt-3 text-xs text-stone-400 hover:text-stone-600"
        >
          Not sure — use the highest-weightage topic instead
        </button>
      </div>
      <div className="flex gap-3 pt-2">
        <button onClick={() => setSection(null)} className="flex-1 py-3 border border-stone-300 rounded-xl text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors">
          Back
        </button>
      </div>
    </div>
  );
}
