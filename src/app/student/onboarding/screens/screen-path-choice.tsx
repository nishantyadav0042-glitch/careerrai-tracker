'use client';

import { X, Check } from 'lucide-react';

interface Props {
  onNext: (data?: Record<string, unknown>) => void;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

// Loss-aversion beat (founder / Cal AI "with vs without"): two futures, side by
// side, right before the plan builds. No marketing words — just the two
// realities. The CTA is an identity choice ("I want the second one"), not a
// neutral "Continue", so advancing is the student picking who they'll be.
const WITHOUT = [
  'Watch random YouTube advice',
  'Change strategy every week',
  'Repeat the same mock mistakes',
  'Wonder what to study next',
];
const WITH = [
  'Know exactly what to study',
  'Review every mock with an IIM senior',
  'Weekly course-correction',
  'One roadmap till CAT',
];

export default function ScreenPathChoice({ onNext, isLoading }: Props) {
  return (
    <div className="space-y-5 pt-1">
      <div>
        <h1 className="text-2xl font-bold leading-snug text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
          Two ways this year can go.
        </h1>
        <p className="mt-2 text-sm text-stone-500">Same effort. Very different outcome.</p>
      </div>

      <div className="space-y-3">
        <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-stone-400">Preparing alone</p>
          <ul className="mt-2 space-y-1.5">
            {WITHOUT.map((t) => (
              <li key={t} className="flex items-start gap-2 text-sm text-stone-500">
                <X className="mt-0.5 h-4 w-4 shrink-0 text-stone-400" />
                {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border-2 border-purple-200 bg-purple-50 p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-purple-600">With CareerRai</p>
          <ul className="mt-2 space-y-1.5">
            {WITH.map((t) => (
              <li key={t} className="flex items-start gap-2 text-sm font-medium text-purple-900">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-purple-600" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <button
        type="button"
        disabled={isLoading}
        onClick={() => onNext()}
        className="w-full rounded-2xl bg-stone-900 py-4 text-sm font-semibold text-white transition-all hover:bg-stone-800 active:scale-[0.98] disabled:opacity-60"
      >
        I want the second one &rarr;
      </button>
    </div>
  );
}
