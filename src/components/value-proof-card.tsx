'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { studyDayString } from '@/lib/study-day';
import { buildValueProof, shouldShowValueProof, type ValueProofInput } from '@/lib/value-proof';

// The claim, repeated on a cadence — founder, 8 Aug: tell them what we do for
// them, free, and keep telling them every two or three days.
//
// It appears on Home rather than as a modal, on purpose. A modal every third
// day is an interruption a student learns to dismiss without reading; a card in
// the flow is something they read once and scroll past forever after, which is
// the correct amount of attention for a message they have already absorbed.
//
// Dismissal is per-appearance, not permanent. Closing it means "not now",
// resets the clock, and it returns in three days — because the founder's point
// is that retention needs telling, and one dismissal is not a decision to never
// hear it again.

const KEY = 'cr_value_proof_seen';
const ROTATION_KEY = 'cr_value_proof_rot';

export function ValueProofCard({ stats }: { stats: Omit<ValueProofInput, 'rotation'> }) {
  const [show, setShow] = useState(false);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    try {
      const today = studyDayString();
      if (!shouldShowValueProof(localStorage.getItem(KEY), today)) return;
      const rot = Number(localStorage.getItem(ROTATION_KEY) ?? '0') || 0;
      /* Seeded from localStorage, which exists only on the client, so there is
         no server value to render from. Guarded by shouldShowValueProof above
         and the day's key is written straight after, so this fires once a day. */
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRotation(rot);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShow(true);
      localStorage.setItem(KEY, today);
      localStorage.setItem(ROTATION_KEY, String(rot + 1));
    } catch {
      // Storage blocked (private mode). Showing it is the safer failure: the
      // message is worth more than the risk of repeating it.
      setShow(true);
    }
  }, []);

  if (!show) return null;
  const v = buildValueProof({ ...stats, rotation });

  return (
    <div className="relative overflow-hidden rounded-2xl bg-stone-900 p-4 text-white">
      <button
        type="button"
        onClick={() => setShow(false)}
        aria-label="Dismiss"
        className="absolute right-2.5 top-2.5 rounded-lg p-1 text-white/40 transition-colors hover:text-white/80"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <p className="pr-6 text-[15px] font-bold leading-snug">{v.headline}</p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-white/70">{v.body}</p>

      {/* The ask, and it is the same ask every single time. A commitment that
          changes wording each week is not a commitment, it is copywriting. */}
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2">
        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400')} />
        <p className="text-[12px] font-semibold leading-snug text-white/90">{v.ask}</p>
      </div>
    </div>
  );
}
