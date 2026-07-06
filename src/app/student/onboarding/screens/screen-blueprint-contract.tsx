'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

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

// The emotional close — not a legal contract, a commitment the student
// makes to themselves, restated back at them with their own real numbers.
// This is the last screen before onComplete() actually fires. Coverage/phase
// come from the same /api/blueprint read the Reveal screen just used;
// archetype and weekly load come straight from the wizard's own state
// (the modal already has them — no reason to refetch what it just wrote).
export default function ScreenBlueprintContract({ onNext, isLoading, archetypeLabel, weeklyLoadHours }: Props) {
  const [data, setData] = useState<ContractSnapshot | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/blueprint');
        if (!res.ok) return;
        const json = await res.json();
        const coverageTotal =
          json.coverageTally.not_started + json.coverageTally.started + json.coverageTally.completed + json.coverageTally.strong;
        setData({
          examTarget: json.examTarget ?? null,
          attemptYear: json.attemptYear ?? null,
          coverageTotal,
          coverageDone: json.coverageTally.completed + json.coverageTally.strong,
          phaseLabel: json.phase.label,
          weeksRemaining: json.weeksRemaining,
        });
      } catch {
        // Never block completion on this read — same policy as the Reveal screen.
      }
    })();
  }, []);

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

      <p className="text-sm text-stone-600 leading-relaxed px-2">
        From here, you never have to decide &quot;what should I study today.&quot;
        CareerRai will plan, adapt, track, and improve your preparation every single day.
      </p>

      <button
        onClick={() => onNext({ onboardingCompleted: true })}
        disabled={isLoading}
        className="w-full py-3.5 bg-stone-900 text-white rounded-2xl font-semibold text-sm active:scale-[0.98] transition-all disabled:opacity-60"
      >
        {isLoading ? 'Finishing up…' : "Let's begin →"}
      </button>
    </div>
  );
}
