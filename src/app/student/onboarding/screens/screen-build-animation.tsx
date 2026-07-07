'use client';

import { useEffect, useState } from 'react';
import { Loader2, Check } from 'lucide-react';

interface Props {
  onNext: (data?: Record<string, unknown>) => Promise<void>;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

// Suspense, not a spinner: each line names a real step the engines below
// actually perform (weakest-section derivation from the declared map,
// topic-selector's opportunity scoring, routine-engine's weekday/weekend
// split, revision cadences, roadmap milestones, tomorrow's mission) — and
// completed lines STACK with checks instead of vanishing, so the student
// watches meaningful work accumulate. Nothing here blocks on a network
// call; the Blueprint was already written to the DB screen-by-screen.
const STEPS = [
  'Finding your strongest section…',
  'Finding your biggest opportunity…',
  'Balancing your weekly workload…',
  'Planning your revision cycles…',
  'Building your milestones…',
  'Preparing your first week…',
];

const STEP_MS = 950;
const FINAL_PAUSE_MS = 900;

export default function ScreenBuildAnimation({ onNext }: Props) {
  const [doneCount, setDoneCount] = useState(0);

  useEffect(() => {
    if (doneCount > STEPS.length) {
      onNext();
      return;
    }
    const id = setTimeout(
      () => setDoneCount((i) => i + 1),
      doneCount === STEPS.length ? FINAL_PAUSE_MS : STEP_MS
    );
    return () => clearTimeout(id);
  }, [doneCount, onNext]);

  return (
    <div className="flex flex-col justify-center gap-5 py-10 px-2">
      <div className="space-y-2.5">
        {STEPS.slice(0, Math.min(doneCount + 1, STEPS.length)).map((line, i) => {
          const isDone = i < doneCount;
          return (
            <div key={line} className="flex items-center gap-2.5">
              {isDone ? (
                <Check className="w-4 h-4 text-teal-600 shrink-0" />
              ) : (
                <Loader2 className="w-4 h-4 text-orange-600 animate-spin shrink-0" />
              )}
              <p className={isDone ? 'text-sm text-stone-500' : 'text-sm font-semibold text-stone-800'}>{line}</p>
            </div>
          );
        })}
      </div>
      {doneCount >= STEPS.length && (
        <p className="text-center text-sm font-bold text-stone-900 pt-2">Almost there…</p>
      )}
    </div>
  );
}
