'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { selectableCatCycles } from '@/lib/cat-cycle';

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

  // Which CAT are they sitting? This screen used to assume "the next November"
  // and clamp every option to 10 Nov of the CURRENT year — so a student here to
  // prepare for CAT 2027 was silently handed a 2026 deadline and a countdown to
  // an exam they aren't taking. Ask first, then price the dates against THEIR
  // exam. A cycle disappears from the list once its own syllabus window closes.
  const cycles = selectableCatCycles(today, 2);
  const [cycleYear, setCycleYear] = useState<number>(cycles[0]?.year ?? today.getFullYear());
  const cycle = cycles.find((c) => c.year === cycleYear) ?? cycles[0];

  const clamp = (d: Date) => (cycle && d > cycle.syllabusCutoff ? cycle.syllabusCutoff : d);
  // For a cycle more than a year out, 6/10/14 weeks is meaningless — those
  // students need month-scale options, not "finish in six weeks".
  const farOut = cycle ? cycle.syllabusCutoff.getTime() - today.getTime() > 400 * 86_400_000 : false;
  const options: { date: Date; speed: string }[] = farOut
    ? [
        { date: clamp(addWeeks(today, 20)), speed: 'Fast' },
        { date: clamp(addWeeks(today, 32)), speed: 'Balanced' },
        { date: clamp(addWeeks(today, 44)), speed: 'Steady' },
      ]
    : [
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

      {cycles.length > 1 && (
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-stone-500">
            Which CAT are you writing?
          </label>
          <div className="flex gap-2">
            {cycles.map((c) => (
              <button
                key={c.year} type="button" onClick={() => { setCycleYear(c.year); setCustom(false); setCustomDate(''); }}
                className={cn(
                  'flex-1 rounded-xl border-2 py-2.5 text-sm font-bold transition-all active:scale-95',
                  cycleYear === c.year
                    ? 'border-orange-500 bg-orange-50 text-orange-700'
                    : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300',
                )}
              >
                {c.label}
                <span className="mt-0.5 block text-[10px] font-medium text-stone-500">
                  {c.examDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {options.map(({ date, speed }) => (
          <button
            key={speed}
            type="button"
            disabled={isLoading}
            onClick={() => onNext({ ambition_date: toIsoDate(date), attempt_year: cycleYear })}
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
                max={cycle ? toIsoDate(cycle.syllabusCutoff) : undefined}
                onChange={(e) => setCustomDate(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900"
              />
              {customDate && (
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => onNext({ ambition_date: customDate, attempt_year: cycleYear })}
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
