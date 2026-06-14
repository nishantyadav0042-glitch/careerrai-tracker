'use client';

import { cn } from '@/lib/utils';

export const EMOTIONAL_CHIPS = [
  { value: 'mock_scared', emoji: '😨', label: 'Mock scared me' },
  { value: 'burned_out', emoji: '🔥', label: 'Burned out' },
  { value: 'comparing', emoji: '👀', label: 'Comparing myself' },
  { value: 'family_pressure', emoji: '🏠', label: 'Family pressure' },
  { value: 'lost_confidence', emoji: '📉', label: 'Lost confidence' },
  { value: 'feeling_behind', emoji: '⏰', label: 'Feeling behind' },
  { value: 'all_good', emoji: '😌', label: 'All good' },
];

interface EmotionalChipsProps {
  selected: string[];
  onChange: (chips: string[]) => void;
}

export function EmotionalChips({ selected, onChange }: EmotionalChipsProps) {
  const toggle = (value: string) => {
    if (value === 'all_good') {
      // all_good is exclusive
      onChange(selected.includes('all_good') ? [] : ['all_good']);
      return;
    }
    const without = selected.filter((v) => v !== 'all_good');
    onChange(
      without.includes(value) ? without.filter((v) => v !== value) : [...without, value]
    );
  };

  return (
    <div>
      <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-3">
        How are you feeling? <span className="normal-case font-normal text-zinc-600">(optional)</span>
      </label>
      <div className="flex flex-wrap gap-2">
        {EMOTIONAL_CHIPS.map(({ value, emoji, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => toggle(value)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all active:scale-95',
              selected.includes(value)
                ? value === 'all_good'
                  ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500'
                  : 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
            )}
          >
            <span>{emoji}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>
      {selected.length > 0 && !selected.includes('all_good') && (
        <p className="text-[11px] text-amber-400/80 mt-2">
          Your buddy sees these — they help them know what to address first.
        </p>
      )}
    </div>
  );
}
