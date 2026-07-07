'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  onNext: (data?: Record<string, unknown>) => Promise<void>;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
  archetypeLabel: string | null;
  weeklyLoadHours: number | null;
}

interface ContractSnapshot {
  examTarget: string | null;
  attemptYear: number | null;
  coverageTotal: number;
  coverageDone: number;
  phaseLabel: string;
  weeksRemaining: number;
}

// Implementation-intention window — Gollwitzer & Sheeran's meta-analysis
// (94 experiments, d = .65): an if-then plan that names WHEN beats a generic
// pledge for follow-through. One tap here turns the contract's commitment
// line from "I'll study" into "If it's <window>, I open today's mission."
type StudyWindow = 'early_morning' | 'daytime' | 'evening' | 'late_night';
const WINDOW_OPTIONS: { value: StudyWindow; label: string; ifThen: string }[] = [
  { value: 'early_morning', label: 'Early morning', ifThen: "it's early morning, before the day starts" },
  { value: 'daytime',       label: 'Daytime',       ifThen: "it's my daytime study slot" },
  { value: 'evening',       label: 'Evening',       ifThen: "it's evening, after classes or work" },
  { value: 'late_night',    label: 'Late night',    ifThen: "it's late night, when things go quiet" },
];

// The emotional close — not a legal contract, a commitment the student
// makes to themselves, restated back at them with their own real numbers
// plus their own named study window. This is the last screen before
// onComplete() actually fires. Coverage/phase come from the same
// /api/blueprint read the Reveal screen just used; archetype and weekly
// load come straight from the wizard's own state.
export default function ScreenBlueprintContract({ onNext, isLoading, archetypeLabel, weeklyLoadHours }: Props) {
  const [data, setData] = useState<ContractSnapshot | null>(null);
  const [window, setWindow] = useState<StudyWindow | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/blueprint');
        if (!res.ok) return;
        const json = await res.json();
        const coverageTotal =
          json.coverageTally.not_started + json.coverageTally.learning + json.coverageTally.practicing + json.coverageTally.exam_ready;
        setData({
          examTarget: json.examTarget ?? null,
          attemptYear: json.attemptYear ?? null,
          coverageTotal,
          coverageDone: json.coverageTally.practicing + json.coverageTally.exam_ready,
          phaseLabel: json.phase.label,
          weeksRemaining: json.weeksRemaining,
        });
      } catch {
        // Never block completion on this read — same policy as the Reveal screen.
      }
    })();
  }, []);

  const chosen = WINDOW_OPTIONS.find((w) => w.value === window) ?? null;

  return (
    <div className="space-y-6 text-center">
      <div className="flex flex-col items-center gap-2">
        <CheckCircle2 className="w-10 h-10 text-teal-600" />
        <h1 className="text-xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
          This is your CAT Blueprint
        </h1>
      </div>

      <div className="bg-white rounded-2xl border-2 border-stone-200 p-5 text-left space-y-2">
        <p className="text-xs font-semibold text-stone-500 uppercase tracking-widest mb-2">Built specifically for</p>
        {data?.examTarget && data?.attemptYear && (
          <p className="text-sm text-stone-800">• {data.examTarget} {data.attemptYear}</p>
        )}
        {archetypeLabel && <p className="text-sm text-stone-800">• {archetypeLabel}</p>}
        {weeklyLoadHours != null && <p className="text-sm text-stone-800">• {weeklyLoadHours}h / week planned</p>}
        <p className="text-sm text-stone-800">• {data?.phaseLabel ?? 'Your current phase'} · {data?.weeksRemaining ?? '—'} weeks to go</p>
        {data && data.coverageTotal > 0 && (
          <p className="text-sm text-stone-800">• Coverage so far: {data.coverageDone}/{data.coverageTotal} topics</p>
        )}
      </div>

      <div className="text-left">
        <p className="text-xs font-semibold text-stone-500 uppercase tracking-widest mb-2">
          When will you usually show up?
        </p>
        <div className="grid grid-cols-2 gap-2">
          {WINDOW_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setWindow(value)}
              className={cn(
                'rounded-xl border-2 py-2.5 px-3 text-sm font-semibold transition-all active:scale-95',
                window === value
                  ? 'border-orange-500 bg-orange-50 text-orange-700'
                  : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-sm text-stone-600 leading-relaxed px-2">
        {chosen ? (
          <>
            <span className="font-semibold text-stone-800">If {chosen.ifThen}, I open today&apos;s mission.</span>{' '}
            That&apos;s the whole deal — CareerRai plans, adapts, and tracks everything else, every single day.
          </>
        ) : (
          <>From here, you never have to decide &quot;what should I study today.&quot; CareerRai will plan, adapt, track, and improve your preparation every single day.</>
        )}
      </p>

      <button
        onClick={() => onNext({ onboardingCompleted: true, study_window: window })}
        disabled={isLoading || window === null}
        className="w-full py-3.5 bg-stone-900 text-white rounded-2xl font-semibold text-sm active:scale-[0.98] transition-all disabled:opacity-60"
      >
        {isLoading ? 'Finishing up…' : window === null ? 'Pick your study window first' : "Let's begin →"}
      </button>
    </div>
  );
}
