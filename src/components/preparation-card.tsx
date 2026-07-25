'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { track } from '@/lib/journey';

// Four numbers instead of one.
//
// The old ring said "78% complete" and meant "you ticked 78% of the boxes".
// Students read it as "you know 78% of CAT". Those are different claims and
// only one of them was true, so the ring is split into the four things it was
// conflating — each of which means exactly one thing and can be checked:
//
//   Coverage    what you say you've covered   (an opinion, weighted lowest)
//   Evidence    rungs actually earned          (the real signal)
//   Revision    how much is still fresh
//   Tested      how much has met exam conditions
//
// The index below them is a blend of those four, with the weights printed
// underneath. It is NOT a percentile and NOT a prediction — we don't have the
// data to forecast a CAT result, and pretending otherwise is the fastest way
// to lose a student who later finds out.

interface Check { id: string; label: string; done: boolean; detail: string }
interface Nearest { topic: string; section: string; passed: number; total: number; checks: Check[] }

interface Prep {
  coveragePct: number; evidencePct: number; revisionPct: number; mockPct: number;
  index: number; basis: string; meaning: string; estimateNote: string;
  topicsWithEvidence: number; topicsTotal: number;
  nearest: Nearest[];
}

const METERS = [
  { key: 'evidencePct', label: 'Evidence',  hint: 'Rungs you have earned' },
  { key: 'revisionPct', label: 'Revision',  hint: 'Still fresh' },
  { key: 'mockPct',     label: 'Tested',    hint: 'Under exam conditions' },
  { key: 'coveragePct', label: 'Coverage',  hint: 'What you told us' },
] as const;

export function PreparationCard() {
  const [prep, setPrep] = useState<Prep | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/preparation');
      if (!res.ok) return;
      setPrep((await res.json()) as Prep);
    } catch { /* render nothing rather than a broken card */ }
  }, []);

  /* eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch */
  useEffect(() => { void load(); }, [load]);

  if (!prep) return null;

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-stone-900">Preparation Index</h2>
        <span className="text-[22px] font-bold tabular-nums text-stone-900">
          {prep.index}<span className="text-[13px] font-semibold text-stone-400">/100</span>
        </span>
      </div>

      <div className="mt-3 space-y-2.5">
        {METERS.map((m) => {
          const v = prep[m.key];
          return (
            <div key={m.key}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[12px] font-semibold text-stone-700">
                  {m.label} <span className="font-normal text-stone-400">· {m.hint}</span>
                </p>
                <span className="shrink-0 text-[12px] font-bold tabular-nums text-stone-600">{v}%</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded bg-stone-100">
                {/* Evidence is the number that matters, so it is the only one
                    drawn in full strength. The rest are context. */}
                <div
                  className={`h-full ${m.key === 'evidencePct' ? 'bg-stone-900' : 'bg-stone-300'}`}
                  style={{ width: `${Math.min(100, v)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* The gap between Coverage and Evidence IS the insight. Naming it is
          more useful than any single score. */}
      {prep.coveragePct - prep.evidencePct >= 15 && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-800">
          You&apos;ve marked {prep.coveragePct}% covered but built evidence for {prep.evidencePct}%.
          Logging what you actually solve closes that gap — it&apos;s the difference
          between having read a topic and being able to score on it.
        </p>
      )}

      <button
        type="button"
        onClick={() => { setOpen((o) => !o); track('prep_index_expanded', { open: !open }); }}
        className="mt-3 flex w-full items-center justify-center gap-1 text-[11px] font-semibold text-stone-500"
      >
        How this is worked out <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-2 space-y-3 border-t border-stone-100 pt-3">
          <p className="text-[11px] leading-relaxed text-stone-500">{prep.basis}</p>
          <p className="text-[11px] leading-relaxed text-stone-500">{prep.meaning}</p>
          <p className="text-[11px] leading-relaxed text-stone-400">{prep.estimateNote}</p>
          <p className="text-[11px] text-stone-500">
            Evidence logged on {prep.topicsWithEvidence} of {prep.topicsTotal} topics.
          </p>

          {prep.nearest.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-stone-400">Closest to earning</p>
              <div className="mt-1.5 space-y-2">
                {prep.nearest.map((n) => (
                  <div key={n.topic}>
                    <p className="text-[12px] font-semibold text-stone-800">
                      {n.topic} <span className="font-normal text-stone-400">{n.passed}/{n.total}</span>
                    </p>
                    {/* The single next thing, quoted from the check itself so
                        the student sees the actual requirement, not a summary. */}
                    <p className="text-[11px] text-stone-500">
                      Next: {n.checks.find((c) => !c.done)?.label ?? '—'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
