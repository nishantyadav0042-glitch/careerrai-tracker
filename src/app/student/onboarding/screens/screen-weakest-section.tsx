'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

// ── The one question that was never asked ───────────────────────────────────
//
// Founder, 14 Aug: "ask weakest section in onboarding, rest in first week."
//
// The planner has always had a chain for this — mock → self-report → baseline
// → coverage grid → DILR — and the audit found three of those four rungs empty
// for EVERY student. Nobody had a self-reported weakest section, nobody had
// baselines. So 78 of 326 students (24%) fell all the way through to the
// hard-coded DILR default: their "personalised" plan was the fallback path,
// and the remaining 76% were personalised off a single signal.
//
// weakestSection decides which section leads the day and takes the 40-55%
// priority slice. It is the highest-leverage input in the product and it cost
// one tap to collect.
//
// WHY IT OUTRANKS THE COVERAGE GRID. The grid measures COVERAGE — what a
// student has studied. This measures WEAKNESS — what they lose marks on. A
// student can have covered every DILR topic and still be terrible at DILR, so
// on the specific question of "what is weakest", the student's own answer is
// better evidence than a completion matrix. That is why the chain already
// placed self-report above the grid; until today nothing was filling it.
//
// "Not sure" is a real answer, not a skip. A student who genuinely does not
// know is telling us something true, and guessing would poison the strongest
// input we have. It stores null and the chain falls through to the grid
// exactly as it does today — no worse than before, and honest.

interface Props {
  onNext: (data: { self_reported_weakest_section: string | null }) => void;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

const OPTIONS = [
  {
    value: 'VARC',
    label: 'VARC',
    sub: 'Reading, para jumbles, summaries',
    tone: 'border-rose-300 bg-rose-50 text-rose-900',
  },
  {
    value: 'DILR',
    label: 'DILR',
    sub: 'Sets, arrangements, caselets',
    tone: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  },
  {
    value: 'QA',
    label: 'QA',
    sub: 'Arithmetic, algebra, geometry',
    tone: 'border-indigo-300 bg-indigo-50 text-indigo-900',
  },
] as const;

export default function ScreenWeakestSection({ onNext, onBack, canGoBack, isLoading }: Props) {
  const [picked, setPicked] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const submit = (value: string | null) => {
    setPicked(value);
    setTouched(true);
    onNext({ self_reported_weakest_section: value });
  };

  return (
    <div className="space-y-5">
      <div className="text-center">
        <p className="text-[10px] font-bold uppercase tracking-widest text-orange-600">Your plan</p>
        <h1
          className="mt-1.5 text-[22px] font-bold leading-tight text-stone-900"
          style={{ fontFamily: 'Georgia, serif' }}
        >
          Which section costs you the most marks?
        </h1>
        <p className="mt-2 text-[13px] leading-snug text-stone-500">
          This one leads your day, every day. One tap.
        </p>
      </div>

      <div className="space-y-2">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            disabled={isLoading}
            onClick={() => submit(o.value)}
            className={cn(
              'flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-3.5 text-left transition-transform active:scale-[0.99] disabled:opacity-60',
              picked === o.value ? o.tone : 'border-stone-200 bg-white',
            )}
          >
            <span className="text-[16px] font-extrabold">{o.label}</span>
            <span className="text-[12px] text-stone-500">{o.sub}</span>
          </button>
        ))}
      </div>

      {/* An honest answer, not an escape hatch — see the header note. */}
      <button
        type="button"
        disabled={isLoading}
        onClick={() => submit(null)}
        className="w-full py-2 text-[12.5px] font-medium text-stone-400 hover:text-stone-600 disabled:opacity-60"
      >
        Not sure yet — decide it from my mocks
      </button>

      {canGoBack && !touched && (
        <button
          type="button"
          onClick={onBack}
          disabled={isLoading}
          className="w-full py-1 text-[12px] text-stone-400 hover:text-stone-600 disabled:opacity-60"
        >
          ← Back
        </button>
      )}
    </div>
  );
}
