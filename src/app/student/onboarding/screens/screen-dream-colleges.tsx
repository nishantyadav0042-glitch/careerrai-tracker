'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

const COLLEGES = [
  'IIM Ahmedabad', 'IIM Bangalore', 'IIM Calcutta',
  'IIM Lucknow', 'IIM Kozhikode', 'IIM Indore',
  'ISB Hyderabad', 'XLRI Jamshedpur', 'MDI Gurgaon',
  'IIFT Delhi', 'SP Jain Mumbai', 'JBIMS Mumbai',
  'FMS Delhi', 'IIM Shillong', 'IIM Udaipur',
];

interface Props {
  onNext: (data: { dream_colleges: string[] }) => void;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

export default function ScreenDreamColleges({ onNext, onBack, canGoBack, isLoading }: Props) {
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (college: string) => {
    setSelected((prev) =>
      prev.includes(college) ? prev.filter((c) => c !== college) : [...prev, college].slice(0, 3)
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-stone-600 leading-relaxed">
          Pick up to <strong>3 colleges</strong> you genuinely want. Not what seems realistic — what you actually want.
          This becomes the north star that drives every daily nudge.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {COLLEGES.map((college) => {
          const isSelected = selected.includes(college);
          const rank = selected.indexOf(college) + 1;
          return (
            <button
              key={college}
              onClick={() => toggle(college)}
              disabled={!isSelected && selected.length >= 3}
              className={cn(
                'relative px-3 py-2 rounded-xl text-sm font-medium transition-all active:scale-95 border',
                isSelected
                  ? 'bg-orange-600 text-white border-orange-600 shadow-md'
                  : selected.length >= 3
                  ? 'bg-stone-100 text-stone-400 border-stone-200 cursor-not-allowed'
                  : 'bg-white text-stone-700 border-stone-300 hover:border-orange-400 hover:bg-orange-50'
              )}
            >
              {isSelected && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-stone-900 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {rank}
                </span>
              )}
              {college}
            </button>
          );
        })}
      </div>

      {selected.length > 0 && (
        <div className="rounded-xl bg-orange-50 border border-orange-200 px-4 py-3">
          <p className="text-xs text-orange-800">
            <strong>#{1}: {selected[0]}</strong>
            {' '}— every insight in this app will point toward this.
          </p>
        </div>
      )}

      <div className="sticky bottom-0 z-20 flex gap-3 bg-white/95 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
        {canGoBack && (
          <button onClick={onBack} className="flex-1 py-3 border border-stone-300 rounded-xl text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors">
            Back
          </button>
        )}
        <button
          onClick={() => onNext({ dream_colleges: selected })}
          disabled={selected.length === 0 || isLoading}
          className={cn(
            'flex-1 py-3 rounded-xl font-semibold text-sm transition-all active:scale-[0.98]',
            selected.length > 0
              ? 'bg-orange-600 text-white hover:bg-orange-700'
              : 'bg-stone-200 text-stone-400 cursor-not-allowed'
          )}
        >
          {selected.length === 0 ? 'Pick at least one' : 'Continue →'}
        </button>
      </div>
    </div>
  );
}
