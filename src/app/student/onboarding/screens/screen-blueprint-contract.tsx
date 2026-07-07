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
  studentName: string | null;
}

interface ContractSnapshot {
  examTarget: string | null;
  attemptYear: number | null;
  coverageTotal: number;
  coverageDone: number;
  phaseLabel: string;
  weeksRemaining: number;
}

// Implementation-intention windows — Gollwitzer & Sheeran's meta-analysis
// (94 experiments, d = .65): an if-then plan that names WHEN beats a generic
// pledge for follow-through. Multi-select: real students show up in more
// than one window (evening AND late night), and the commitment line names
// every window they picked.
type StudyWindow = 'early_morning' | 'daytime' | 'evening' | 'late_night';
const WINDOW_OPTIONS: { value: StudyWindow; label: string; phrase: string }[] = [
  { value: 'early_morning', label: 'Early morning', phrase: 'early morning' },
  { value: 'daytime',       label: 'Daytime',       phrase: 'daytime' },
  { value: 'evening',       label: 'Evening',       phrase: 'evening' },
  { value: 'late_night',    label: 'Late night',    phrase: 'late night' },
];

function joinPhrases(phrases: string[]): string {
  if (phrases.length <= 1) return phrases[0] ?? '';
  return `${phrases.slice(0, -1).join(', ')} or ${phrases[phrases.length - 1]}`;
}

// The emotional close — not a legal contract, a commitment the student
// makes to themselves, restated back at them with their own real numbers
// plus their own named study window. This is the last screen before
// onComplete() actually fires. Coverage/phase come from the same
// /api/blueprint read the Reveal screen just used; archetype and weekly
// load come straight from the wizard's own state.
export default function ScreenBlueprintContract({ onNext, isLoading, archetypeLabel, weeklyLoadHours, studentName }: Props) {
  const [data, setData] = useState<ContractSnapshot | null>(null);
  const [windows, setWindows] = useState<StudyWindow[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/blueprint');
        if (!res.ok) return;
        const json = await res.json();
        const coverageTotal =
          json.coverageTally.not_started + json.coverageTally.learning + json.coverageTally.practicing + json.coverageTally.revising + json.coverageTally.exam_ready;
        setData({
          examTarget: json.examTarget ?? null,
          attemptYear: json.attemptYear ?? null,
          coverageTotal,
          coverageDone: json.coverageTally.practicing + json.coverageTally.revising + json.coverageTally.exam_ready,
          phaseLabel: json.phase.label,
          weeksRemaining: json.weeksRemaining,
        });
      } catch {
        // Never block completion on this read — same policy as the Reveal screen.
      }
    })();
  }, []);

  const chosen = WINDOW_OPTIONS.filter((w) => windows.includes(w.value));
  const toggleWindow = (value: StudyWindow) =>
    setWindows((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));

  return (
    <div className="space-y-6 text-center">
      <div className="flex flex-col items-center gap-2">
        <CheckCircle2 className="w-10 h-10 text-teal-600" />
        <h1 className="text-xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
          {studentName ? `${studentName}, this Blueprint` : 'This Blueprint'} was built only for you
        </h1>
      </div>

      <div className="bg-white rounded-2xl border-2 border-stone-200 p-5 text-left space-y-2">
        <p className="text-xs font-semibold text-stone-500 uppercase tracking-widest mb-2">Built specifically for</p>
        {data?.examTarget && data?.attemptYear && (
          <p className="text-sm text-stone-800">• {data.examTarget} {data.attemptYear}</p>
        )}
        {archetypeLabel && <p className="text-sm text-stone-800">• {archetypeLabel}</p>}
        {weeklyLoadHours != null && <p className="text-sm text-stone-800">• {weeklyLoadHours}h / week planned</p>}
        <p className="text-sm text-stone-800">• {data?.phaseLabel ?? 'Your current phase'} · {data != null ? `${data.weeksRemaining * 7} study days to CAT` : '—'}</p>
        {data && data.coverageTotal > 0 && (
          <p className="text-sm text-stone-800">• {data.coverageTotal} learning units mapped · {data.coverageDone} already in motion</p>
        )}
        <p className="text-sm text-stone-800">• Generated today</p>
      </div>

      <div className="text-left">
        <p className="text-xs font-semibold text-stone-500 uppercase tracking-widest mb-2">
          When will you usually show up? <span className="normal-case font-normal text-stone-400">Pick all that apply</span>
        </p>
        <div className="grid grid-cols-2 gap-2">
          {WINDOW_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => toggleWindow(value)}
              className={cn(
                'rounded-xl border-2 py-2.5 px-3 text-sm font-semibold transition-all active:scale-95',
                windows.includes(value)
                  ? 'border-orange-500 bg-orange-50 text-orange-700'
                  : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300'
              )}
            >
              {windows.includes(value) ? '✓ ' : ''}{label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-sm text-stone-600 leading-relaxed px-2">
        {chosen.length > 0 ? (
          <>
            <span className="font-semibold text-stone-800">If it&apos;s {joinPhrases(chosen.map((c) => c.phrase))}, I open today&apos;s mission.</span>{' '}
            That&apos;s the whole deal — every decision about your CAT preparation now has a home.
          </>
        ) : (
          <>Every decision about your CAT preparation now has a home — what to study, when to revise, when to mock. CareerRai plans, adapts, and tracks it every single day.</>
        )}
      </p>

      <button
        onClick={() => onNext({ onboardingCompleted: true, study_windows: windows, study_window: windows[0] ?? null })}
        disabled={isLoading || windows.length === 0}
        className="w-full py-3.5 bg-stone-900 text-white rounded-2xl font-semibold text-sm active:scale-[0.98] transition-all disabled:opacity-60"
      >
        {isLoading ? 'Finishing up…' : windows.length === 0 ? 'Pick at least one study window' : '🤝 I commit to following this Blueprint'}
      </button>
    </div>
  );
}
