'use client';

import { useState } from 'react';
import { KNOWLEDGE_GRAPH } from '@/lib/topics-constants';

interface Props {
  onNext: (data?: Record<string, unknown>) => void;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

// Total is the SAME set of units the very next screen (the coverage grid) asks
// them to map — computed, never hardcoded — so "out of N" always matches what
// they're about to fill. No invented number.
const TOTAL = KNOWLEDGE_GRAPH.flatMap((s) => s.groups.flatMap((g) => g.units)).length;

const QUESTIONS = [
  `Do you know EXACTLY how many of the ${TOTAL} CAT topics you've completed?`,
  'If CAT happened tomorrow, do you know your weakest topics?',
  'After every mock, do you know exactly what to study next?',
];

// Reality-check (founder): a gut-check RIGHT BEFORE the coverage grid. Most
// aspirants can't answer these — and that blind spot, not low marks, is why
// prep quietly drifts. The screen makes them FEEL the gap, then hands them the
// fix (the grid maps all N in two minutes). Honest: the pain is real and
// self-evident, no invented statistics.
export default function ScreenRealityCheck({ onNext, isLoading }: Props) {
  const [answers, setAnswers] = useState<(boolean | null)[]>([null, null, null]);
  const answered = answers.every((a) => a !== null);
  const noCount = answers.filter((a) => a === false).length;

  const setAns = (i: number, val: boolean) =>
    setAnswers((prev) => prev.map((a, idx) => (idx === i ? val : a)));

  return (
    <div className="space-y-5 pt-1">
      <div>
        <h1 className="text-2xl font-bold leading-snug text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
          Before we map your syllabus — a gut check.
        </h1>
      </div>

      <div className="space-y-3">
        {QUESTIONS.map((q, i) => (
          <div key={i} className="rounded-2xl border border-stone-200 p-3.5">
            <p className="text-sm font-medium text-stone-800">{q}</p>
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                onClick={() => setAns(i, true)}
                className={`flex-1 rounded-xl py-2 text-sm font-semibold transition-all active:scale-[0.98] ${answers[i] === true ? 'bg-stone-900 text-white' : 'border border-stone-200 text-stone-600 hover:border-stone-300'}`}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setAns(i, false)}
                className={`flex-1 rounded-xl py-2 text-sm font-semibold transition-all active:scale-[0.98] ${answers[i] === false ? 'bg-stone-900 text-white' : 'border border-stone-200 text-stone-600 hover:border-stone-300'}`}
              >
                No
              </button>
            </div>
          </div>
        ))}
      </div>

      {answered && (
        <div className="rounded-2xl bg-stone-900 p-4 text-white">
          <p className="text-sm leading-relaxed">
            {noCount >= 2
              ? 'You’re not alone — most CAT aspirants can’t answer these either. That’s exactly why we built CareerRai. Let’s make it exact in the next 2 minutes.'
              : noCount === 1
                ? 'Almost — but “almost sure” is exactly where prep quietly drifts. Let’s make it exact.'
                : 'Impressive — most can’t. Let’s lock it in so your whole plan is built on it.'}
          </p>
          <button
            type="button"
            disabled={isLoading}
            onClick={() => onNext({ reality_check_no_count: noCount })}
            className="mt-3 w-full rounded-xl bg-white py-3 text-sm font-bold text-stone-900 transition-all active:scale-[0.98] disabled:opacity-60"
          >
            Map all {TOTAL} — show me exactly where I stand &rarr;
          </button>
        </div>
      )}
    </div>
  );
}
