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

  return (
    <div className="bg-stone-900 rounded-2xl px-4 py-3.5 mb-4">
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-orange-400">Your Blueprint</p>
        <div className="flex gap-1">
          {Array.from({ length: totalSections + 1 }).map((_, i) => (
            <div
              key={i}
              className={cn('w-4 h-1 rounded-full transition-colors', i <= sectionIndex + 1 ? 'bg-orange-500' : 'bg-stone-700')}
            />
          ))}
        </div>
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
