'use client';

import { cn } from '@/lib/utils';
import type { BlueprintPreview } from '@/lib/blueprint-builder';

interface Props {
  preview: BlueprintPreview;
  sectionIndex: number; // 0-3, which of the sections is active right now
  coverageSectionIndex: number;
  totalSections: number;
}

// The TurboTax mechanism (founder decision): show the ASSET being assembled,
// not a survey progress bar. A student who sees "✓ Exam context locked ·
// ✓ 18h/week mapped · ⏳ Preparation map" is constructing something they'd
// lose by leaving — loss aversion, not motivation. Every ✓ fact is real
// output of computeBlueprintPreview; nothing is staged. The first row starts
// checked because the account genuinely is completed work (a truthful
// endowed head start measurably lifts completion).
export function BlueprintPanel({ preview, sectionIndex, coverageSectionIndex, totalSections }: Props) {
  const pastCoverage = sectionIndex > coverageSectionIndex
    || (sectionIndex === coverageSectionIndex && !!preview.coverageBadge);

  const rows: { key: string; state: 'done' | 'active' | 'pending'; label: string }[] = [
    { key: 'account', state: 'done', label: 'Account created' },
    {
      key: 'position',
      state: sectionIndex > 0 ? 'done' : 'active',
      label: sectionIndex > 0
        ? `Exam context locked${preview.archetypeBadge ? ` · ${preview.archetypeBadge}` : ''}`
        : 'Exam context',
    },
    {
      key: 'time',
      state: sectionIndex > 1 ? 'done' : sectionIndex === 1 ? 'active' : 'pending',
      label: sectionIndex > 1
        ? `Real hours mapped${preview.weeklyLoadHours != null ? ` · ${preview.weeklyLoadHours}h/week` : ''}`
        : 'Your real hours',
    },
    {
      key: 'coverage',
      state: pastCoverage ? 'done' : sectionIndex === coverageSectionIndex ? 'active' : 'pending',
      label: pastCoverage
        ? `Preparation map built${preview.coverageBadge ? ` · ${preview.coverageBadge}` : ''}`
        : sectionIndex === coverageSectionIndex
          ? 'Mapping your preparation…'
          : 'Preparation map',
    },
    {
      key: 'routine',
      state: sectionIndex >= totalSections ? 'done' : 'pending',
      label: 'Your day-one routine',
    },
  ];

  return (
    <div className="bg-stone-900 rounded-2xl px-4 py-3.5 mb-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-orange-400 mb-2">My CAT Plan</p>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-2">
            <span
              className={cn(
                'w-4 shrink-0 text-center text-xs font-bold',
                r.state === 'done' ? 'text-teal-400' : r.state === 'active' ? 'text-orange-400 animate-pulse' : 'text-stone-600'
              )}
            >
              {r.state === 'done' ? '✓' : r.state === 'active' ? '⏳' : '·'}
            </span>
            <span
              className={cn(
                'text-[11px] font-semibold',
                r.state === 'done' ? 'text-white' : r.state === 'active' ? 'text-orange-200' : 'text-stone-500'
              )}
            >
              {r.label}
            </span>
          </div>
        ))}
      </div>
      {preview.projectionBadge && (
        <p className="mt-2 text-xs font-semibold text-teal-300">
          {preview.projectionBadge}
        </p>
      )}
    </div>
  );
}
