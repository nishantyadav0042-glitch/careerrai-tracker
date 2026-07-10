'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  onNext: (data?: Record<string, unknown>) => void;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

const HOURS = [1, 2, 3, 4, 6];

function Chip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all active:scale-95',
        active ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 bg-white text-stone-700 hover:border-stone-900'
      )}
    >
      {label}
    </button>
  );
}

// Three fast facts, one screen, no essay questions — coaching status,
// attempt history, and daily hours available all in one quick tap-through.
export default function ScreenQuickFacts({ onNext, onBack, canGoBack, isLoading }: Props) {
  const [hours, setHours] = useState<number | null>(null);
  const [coaching, setCoaching] = useState<boolean | null>(null);
  const [repeater, setRepeater] = useState<boolean | null>(null);

  const canContinue = hours != null && coaching != null && repeater != null;

  return (
    <div className="space-y-6 pt-1">
      <div>
        <h1 className="text-xl font-bold text-stone-900 leading-snug" style={{ fontFamily: 'Georgia, serif' }}>
          A few quick facts.
        </h1>
        <p className="mt-1.5 text-sm text-stone-500">Three taps — this is what shapes your daily routine.</p>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-stone-800">Hours you can give daily</p>
        <div className="flex flex-wrap gap-2">
          {HOURS.map((h) => (
            <Chip key={h} active={hours === h} label={`${h}h`} onClick={() => setHours(h)} />
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-stone-800">Coaching</p>
        <div className="flex gap-2">
          <Chip active={coaching === true} label="Enrolled" onClick={() => setCoaching(true)} />
          <Chip active={coaching === false} label="Self-prep" onClick={() => setCoaching(false)} />
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-stone-800">CAT attempt</p>
        <div className="flex gap-2">
          <Chip active={repeater === false} label="First attempt" onClick={() => setRepeater(false)} />
          <Chip active={repeater === true} label="Repeating" onClick={() => setRepeater(true)} />
        </div>
      </div>

      <div className="flex gap-3 pt-1">
        {canGoBack && (
          <button onClick={onBack} disabled={isLoading} className="flex-1 rounded-xl border border-stone-300 py-3 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50">
            Back
          </button>
        )}
        <button
          onClick={() => onNext({ hours_available: hours, coaching_enrolled: coaching, is_repeater: repeater })}
          disabled={!canContinue || isLoading}
          className={cn(
            'flex-1 rounded-xl py-3 text-sm font-semibold transition-all active:scale-[0.98]',
            canContinue ? 'bg-stone-900 text-white hover:bg-stone-800' : 'cursor-not-allowed bg-stone-200 text-stone-400'
          )}
        >
          Continue →
        </button>
      </div>
    </div>
  );
}
