'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { WeeklyInsight } from '@/lib/weekly-insight';

// ── The Monday review, folded away ─────────────────────────────────────────
//
// Founder, 22 Aug: "do not complicate Home — one line, nothing else." The
// weekly review is genuinely several paragraphs, so it arrives here as ONE
// line and opens only if the student asks for it. Closed, it costs the same
// screen space as the daily insight bubble above it; open, it is the whole
// week.
//
// It renders only when the engine returned `ready`. The not_enough_data state
// is deliberately NOT shown on Home: a student who did not log last week does
// not need a card on their study screen telling them so, and "we have nothing
// to say about you" is not worth a permanent slot. They see the daily line,
// which is the layer that can still reach them.

const RANGE = (start: string, end: string) => {
  const f = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${f(start)} – ${f(end)}`;
};

export function WeeklyReviewCard({ insight }: { insight: WeeklyInsight }) {
  const [open, setOpen] = useState(false);
  if (insight.status !== 'ready') return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-stone-50"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
            Your week · {RANGE(insight.start, insight.end)}
          </p>
          <p className="mt-0.5 truncate text-[13.5px] font-semibold text-stone-900">{insight.headline}</p>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-stone-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="space-y-3 border-t border-stone-100 px-4 py-3.5">
          {insight.sections.map((s) => (
            <div key={s.id}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">{s.label}</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-stone-700">{s.text}</p>
            </div>
          ))}
          {/* Every number above came from the student's own rows, and the
              review says only as much as it can trace. Naming that is the
              point: it is the difference between a review and a horoscope. */}
          <p className="pt-1 text-[11px] leading-relaxed text-stone-400">
            Built from your own logs for that week. Anything we could not see, we did not say.
          </p>
        </div>
      )}
    </div>
  );
}
