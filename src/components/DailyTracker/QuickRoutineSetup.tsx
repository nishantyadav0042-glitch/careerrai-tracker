'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

type Section = 'VARC' | 'DILR' | 'QA';

// The ONE mandatory tap before the routine engine can personalize anything —
// weakest section drives ~40% of the daily time budget. Weekend hours is a
// single optional follow-up, skippable, because it only refines an already-
// reasonable default. Total worst case: 2 taps. Best case (skip weekends): 1.
export function QuickRoutineSetup({ needsWeekendHours, onDone }: { needsWeekendHours: boolean; onDone: () => void }) {
  const [weakest, setWeakest] = useState<Section | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(weekendHours?: number) {
    if (!weakest || saving) return;
    setSaving(true);
    try {
      await fetch('/api/routine/quick-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weakest_section: weakest, ...(weekendHours != null ? { weekend_hours: weekendHours } : {}) }),
      });
      onDone();
    } finally {
      setSaving(false);
    }
  }

  function pickWeakest(s: Section) {
    setWeakest(s);
    if (!needsWeekendHours) submit(); // single tap, done — no follow-up to show
  }

  return (
    <div className="py-2">
      {!weakest ? (
        <>
          <p className="text-sm font-bold text-stone-900 mb-0.5">Which section is toughest for you?</p>
          <p className="text-xs text-stone-500 mb-3">One tap — this shapes today&apos;s routine.</p>
          <div className="grid grid-cols-3 gap-2">
            {(['VARC', 'DILR', 'QA'] as const).map((s) => (
              <button
                key={s}
                onClick={() => pickWeakest(s)}
                className="rounded-xl border-2 border-stone-200 py-3 text-sm font-bold text-stone-700 hover:border-orange-400 hover:bg-orange-50 hover:text-orange-700 transition-all active:scale-95"
              >
                {s}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="text-sm font-bold text-stone-900 mb-0.5">Do you study more on weekends?</p>
          <p className="text-xs text-stone-500 mb-3">Optional — fine-tunes Saturday/Sunday.</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'About the same', hours: null },
              { label: 'A bit more', hours: 2 },
              { label: 'A lot more', hours: 5 },
            ].map(({ label, hours }) => (
              <button
                key={label}
                disabled={saving}
                onClick={() => (hours == null ? submit() : submit(hours))}
                className={cn(
                  'rounded-xl border-2 border-stone-200 py-3 px-1 text-xs font-semibold text-stone-700 hover:border-orange-400 hover:bg-orange-50 hover:text-orange-700 transition-all active:scale-95',
                  saving && 'opacity-50'
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => submit()}
            disabled={saving}
            className="mt-2.5 text-xs text-stone-400 hover:text-stone-600"
          >
            Skip
          </button>
        </>
      )}
    </div>
  );
}
