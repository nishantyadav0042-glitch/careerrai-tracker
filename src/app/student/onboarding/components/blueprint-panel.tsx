'use client';

import { cn } from '@/lib/utils';
import type { BlueprintPreview } from '@/lib/blueprint-builder';

interface Props {
  preview: BlueprintPreview;
  sectionIndex: number; // 0-3, which of the 4 sections is active right now
  coverageSectionIndex: number;
  totalSections: number;
}

// The "wow" mechanism: a persistent strip that fills in as the student
// answers, so building the Blueprint is watched, not submitted. Every fact
// shown here is real output of computeBlueprintPreview — nothing is staged.
// The progress bar shows totalSections + 1 segments with the first one
// already lit: the account itself is genuinely completed work (endowed
// progress — a truthful head start measurably lifts completion).
export function BlueprintPanel({ preview, sectionIndex, coverageSectionIndex, totalSections }: Props) {
  const facts: { key: string; label: string }[] = [];
  if (preview.examBadge) facts.push({ key: 'exam', label: preview.examBadge });
  if (preview.archetypeBadge) facts.push({ key: 'archetype', label: preview.archetypeBadge });
  if (preview.focusBadge) facts.push({ key: 'focus', label: `Focus: ${preview.focusBadge}` });
  if (preview.weeklyLoadHours != null) facts.push({ key: 'load', label: `${preview.weeklyLoadHours}h / week` });
  if (preview.coverageBadge) facts.push({ key: 'coverage', label: preview.coverageBadge });
  else if (sectionIndex >= coverageSectionIndex) facts.push({ key: 'coverage', label: 'Mapping your coverage…' });

  // Construction, not percentage — 12 build cells filling as sections land
  // (first chunk pre-lit: the account is real completed work). The active
  // cell pulses: the student is watching something being built, not
  // watching a survey progress bar.
  const TOTAL_CELLS = 12;
  const filledCells = Math.min(TOTAL_CELLS, Math.round(((sectionIndex + 2) / (totalSections + 2)) * TOTAL_CELLS));
  const stillBuilding = filledCells < TOTAL_CELLS;

  return (
    <div className="bg-stone-900 rounded-2xl px-4 py-3.5 mb-4">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-orange-400">My CAT Plan</p>
        <p className="text-[10px] text-stone-500 italic">{stillBuilding ? 'Building…' : 'Built'}</p>
      </div>
      <div className="flex gap-0.5 mb-2.5">
        {Array.from({ length: TOTAL_CELLS }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'flex-1 h-2 first:rounded-l-sm last:rounded-r-sm transition-colors duration-500',
              i < filledCells ? 'bg-orange-500' : 'bg-stone-700',
              stillBuilding && i === filledCells - 1 && 'animate-pulse'
            )}
          />
        ))}
      </div>
      {facts.length === 0 ? (
        <p className="text-xs text-stone-500 italic">Account in — building the rest as you go…</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {facts.map((f) => (
            <span
              key={f.key}
              className="text-[11px] font-semibold text-white bg-white/10 rounded-lg px-2.5 py-1"
            >
              {f.label}
            </span>
          ))}
        </div>
      )}
      {preview.projectionBadge && (
        <p className="mt-2 text-xs font-semibold text-teal-300">
          {preview.projectionBadge}
        </p>
      )}
    </div>
  );
}
