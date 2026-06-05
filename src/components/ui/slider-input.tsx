'use client';
import { cn } from '@/lib/utils';

type Color = 'stone' | 'orange' | 'teal' | 'rose';

const accentMap: Record<Color, string> = {
  stone: 'accent-stone-900',
  orange: 'accent-orange-600',
  teal: 'accent-teal-700',
  rose: 'accent-rose-600',
};

export function SliderInput({
  label,
  value,
  onChange,
  min = 1,
  max = 5,
  leftLabel,
  rightLabel,
  color = 'stone',
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  leftLabel?: string;
  rightLabel?: string;
  color?: Color;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-stone-800">{label}</label>
        <span className="text-sm font-mono font-semibold text-stone-900 bg-stone-100 px-2 py-0.5 rounded">
          {value}/{max}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn('w-full h-2 rounded-lg cursor-pointer', accentMap[color])}
      />
      {(leftLabel || rightLabel) && (
        <div className="flex justify-between mt-1">
          <span className="text-[10px] uppercase tracking-wider text-stone-500">{leftLabel}</span>
          <span className="text-[10px] uppercase tracking-wider text-stone-500">{rightLabel}</span>
        </div>
      )}
    </div>
  );
}
