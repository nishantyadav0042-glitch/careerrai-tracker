'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  onNext: (data?: Record<string, unknown>) => void;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

function addWeeks(base: Date, weeks: number): Date {
  return new Date(base.getTime() + weeks * 7 * 86_400_000);
}
function fmt(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}
function toIsoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

// The date the student owns before any account exists. No hours math yet —
// that comes later, once their topics are mapped and they've logged in.
export default function ScreenTargetDate({ onNext, onBack, canGoBack, isLoading }: Props) {
  const [custom, setCustom] = useState(false);
  const [customDate, setCustomDate] = useState('');

  const today = new Date();
  let cutoffYear = today.getFullYear();
  if (today > new Date(cutoffYear, 10, 10)) cutoffYear += 1;
  const cutoff = new Date(cutoffYear, 10, 10);
  const clamp = (d: Date) => (d > cutoff ? cutoff : d);
  const options: { date: Date; speed: string }[] = [
    { date: clamp(addWeeks(today, 6)), speed: 'Fast' },
    { date: clamp(addWeeks(today, 10)), speed: 'Balanced' },
    { date: clamp(addWeeks(today, 14)), speed: 'Steady' },
  ];

  return (
    <div className="space-y-5 pt-1">
      <div>
        <h1 className="text-xl font-bold text-stone-900 leading-snug" style={{ fontFamily: 'Georgia, serif' }}>
          When do you want to finish your syllabus?
        </h1>
        <p className="mt-1.5 text-sm text-stone-500">
          You own this date. Once your topics are mapped, we&apos;ll show exactly what it costs per day.
        </p>
      </div>

      <div className="space-y-2">
        {options.map(({ date, speed }) => (
          <button
            key={speed}
            type="button"
            disabled={isLoading}
            onClick={() => onNext({ ambition_date: toIsoDate(date) })}
            className="w-full rounded-2xl border-2 border-stone-200 bg-white p-4 text-left transition-all hover:border-stone-900 active:scale-[0.98]"
          >
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-base font-bold text-stone-900">{fmt(date)}</p>
              <p className="text-xs font-semibold text-stone-500">{speed}</p>
            </div>
          </button>
        ))}

        <div className={cn('rounded-2xl border-2 p-4 transition-all', custom ? 'border-stone-900 bg-stone-50' : 'border-stone-200 bg-white')}>
          <button type="button" className="w-full text-left" onClick={() => setCustom(true)}>
            <p className="text-base font-bold text-stone-900">My own date</p>
          </button>
          {custom && (
            <div className="mt-3 space-y-2">
              <input
                type="date"
                value={customDate}
                min={toIsoDate(addWeeks(today, 1))}
                max={toIsoDate(cutoff)}
                onChange={(e) => setCustomDate(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900"
              />
              {customDate && (
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => onNext({ ambition_date: customDate })}
                  className="w-full rounded-xl bg-stone-900 py-2.5 text-sm font-semibold text-white transition-all hover:bg-stone-800 active:scale-[0.98]"
                >
                  {fmt(new Date(customDate + 'T00:00:00'))} — this is my date →
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {canGoBack && (
        <button onClick={onBack} disabled={isLoading} className="w-full py-3 border border-stone-300 rounded-xl text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors">
          Back
        </button>
      )}
    </div>
  );
}
