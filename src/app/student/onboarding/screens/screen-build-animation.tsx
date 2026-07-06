'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface Props {
  onNext: (data?: Record<string, unknown>) => Promise<void>;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

// Each line names a real step the engines below actually perform — Topic
// Selector's weakest-section weighting, routine-engine's revision cadence,
// mission-engine's priority pick — not decorative copy. Auto-advances once
// the sequence finishes; nothing here blocks on a network call, since the
// Blueprint itself was already being written to the DB screen-by-screen.
const STEPS = [
  'Analyzing your preparation…',
  'Finding your strongest scoring opportunities…',
  'Balancing QA, VARC & DILR…',
  'Planning revision cycles…',
  'Calculating your weekly workload…',
  'Preparing your first mission…',
];

const STEP_MS = 650;

export default function ScreenBuildAnimation({ onNext }: Props) {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (stepIndex >= STEPS.length) {
      onNext();
      return;
    }
    const id = setTimeout(() => setStepIndex((i) => i + 1), STEP_MS);
    return () => clearTimeout(id);
  }, [stepIndex, onNext]);

  return (
    <div className="flex flex-col items-center justify-center gap-6 py-16">
      <Loader2 className="w-8 h-8 text-orange-600 animate-spin" />
      <div className="space-y-2 text-center min-h-[4.5rem]">
        {STEPS.slice(0, stepIndex + 1).slice(-1).map((line) => (
          <p key={line} className="text-base font-semibold text-stone-800">{line}</p>
        ))}
      </div>
    </div>
  );
}
