'use client';

import type { EvidenceItem } from '@/lib/evidence/mock-evidence';

// ── What a mock tells us, in the order a student can use it ────────────────
//
// The confidence of each line (fact / inference / unknown) is carried in the
// data, and the student never sees the word. A clinical "INFERENCE" badge on
// every sentence is not honesty, it is decoration — the honesty already lives
// in how the sentence is written. Here it is expressed as typography only:
// what we measured reads solid, what we suspect reads lighter, and what we
// cannot see sits quietly at the bottom instead of being hidden.
//
// The last line matters most for trust. A student who is never told what the
// scorecard could not show will assume we saw everything and stayed silent.

const WEIGHT: Record<EvidenceItem['confidence'], string> = {
  fact: 'text-[13.5px] font-semibold text-stone-900',
  inference: 'text-[13px] text-stone-700',
  unknown: 'text-[11.5px] text-stone-500',
};

const ORDER: EvidenceItem['confidence'][] = ['fact', 'inference', 'unknown'];

export function MockEvidenceCard({
  items,
  fallback,
  onDismiss,
}: {
  items: EvidenceItem[];
  /** Used when this mock measured nothing — a percentile line, still true. */
  fallback: string | null;
  onDismiss: () => void;
}) {
  const ranked = ORDER.flatMap((c) => items.filter((i) => i.confidence === c));
  if (ranked.length === 0 && !fallback) return null;

  return (
    <div className="flex items-start gap-2 rounded-2xl border border-stone-300 bg-stone-100 px-4 py-3">
      <span className="mt-0.5 shrink-0 text-xs font-bold text-stone-900">📊</span>
      <div className="min-w-0 flex-1 space-y-1.5">
        {ranked.length > 0
          ? ranked.map((i) => (
              <p key={i.id} className={WEIGHT[i.confidence]}>
                {i.text}
              </p>
            ))
          : <p className="text-sm text-stone-900">{fallback}</p>}
      </div>
      <button
        onClick={onDismiss}
        className="shrink-0 text-xs text-stone-900 hover:text-stone-900"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
