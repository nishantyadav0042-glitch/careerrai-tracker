'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { QUANT_TOPICS, VERBAL_TOPICS, LRDI_TOPICS } from '@/lib/topics-constants';

type Section = 'VARC' | 'DILR' | 'QA';

// Reuses the same topic taxonomy already shown in daily logging — "weakest
// section" alone is too coarse (every CAT aspirant already knows to study
// VARC/DILR/QA); naming the actual toughest topic is what makes the routine
// feel precise instead of a generic template.
const TOPICS_BY_SECTION: Record<Section, string[]> = {
  VARC: VERBAL_TOPICS,
  DILR: LRDI_TOPICS,
  QA: QUANT_TOPICS,
};

// Up to 3 taps total: weakest section, toughest topic within it (skippable),
// weekend hours (skippable). Any step already answered is skipped — a
// returning student who set their section before this shipped only sees the
// topic tap, not the whole flow again.
export function QuickRoutineSetup({
  initialWeakest,
  needsWeekendHours,
  onDone,
}: {
  initialWeakest: Section | null;
  needsWeekendHours: boolean;
  onDone: () => void;
}) {
  const [weakest, setWeakest] = useState<Section | null>(initialWeakest);
  const [topic, setTopic] = useState<string | null>(null);
  const [topicAnswered, setTopicAnswered] = useState(false);
  const [saving, setSaving] = useState(false);

  const needsTopic = !!weakest && !topicAnswered;

  async function submit(finalTopic: string | null, weekendHours?: number) {
    if (!weakest || saving) return;
    setSaving(true);
    try {
      await fetch('/api/routine/quick-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weakest_section: weakest,
          weak_topic: finalTopic ?? '',
          ...(weekendHours != null ? { weekend_hours: weekendHours } : {}),
        }),
      });
      onDone();
    } finally {
      setSaving(false);
    }
  }

  function pickWeakest(s: Section) {
    setWeakest(s);
  }

  function chooseTopic(t: string) {
    setTopic(t);
    setTopicAnswered(true);
    if (!needsWeekendHours) submit(t);
  }

  function skipTopic() {
    setTopicAnswered(true);
    if (!needsWeekendHours) submit(null);
  }

  return (
    <div className="py-2">
      {!weakest ? (
        <>
          <p className="text-sm font-bold text-stone-900 mb-0.5">Which section is toughest for you?</p>
          <p className="text-xs text-stone-500 mb-3">One tap — this shapes today&apos;s routine.</p>
          <div className="grid grid-cols-3 gap-2">
            {(['VARC', 'DILR', 'QA'] as const).map((s) => (
              <button
                key={s}
                onClick={() => pickWeakest(s)}
                className="rounded-xl border-2 border-stone-200 py-3 text-sm font-bold text-stone-700 hover:border-orange-400 hover:bg-orange-50 hover:text-orange-700 transition-all active:scale-95"
              >
                {s}
              </button>
            ))}
          </div>
        </>
      ) : needsTopic ? (
        <>
          <p className="text-sm font-bold text-stone-900 mb-0.5">Which part of {weakest} is toughest?</p>
          <p className="text-xs text-stone-500 mb-3">This is what makes today&apos;s tasks specific, not generic.</p>
          <div className="grid grid-cols-2 gap-2">
            {TOPICS_BY_SECTION[weakest].map((t) => (
              <button
                key={t}
                disabled={saving}
                onClick={() => chooseTopic(t)}
                className={cn(
                  'rounded-xl border-2 border-stone-200 py-2.5 px-2 text-xs font-semibold text-stone-700 hover:border-orange-400 hover:bg-orange-50 hover:text-orange-700 transition-all active:scale-95',
                  saving && 'opacity-50'
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <button
            onClick={skipTopic}
            disabled={saving}
            className="mt-2.5 text-xs text-stone-400 hover:text-stone-600"
          >
            Not sure — use the highest-weightage topic instead
          </button>
        </>
      ) : (
        <>
          <p className="text-sm font-bold text-stone-900 mb-0.5">Do you study more on weekends?</p>
          <p className="text-xs text-stone-500 mb-3">Optional — fine-tunes Saturday/Sunday.</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'About the same', hours: null },
              { label: 'A bit more', hours: 2 },
              { label: 'A lot more', hours: 5 },
            ].map(({ label, hours }) => (
              <button
                key={label}
                disabled={saving}
                onClick={() => submit(topic, hours ?? undefined)}
                className={cn(
                  'rounded-xl border-2 border-stone-200 py-3 px-1 text-xs font-semibold text-stone-700 hover:border-orange-400 hover:bg-orange-50 hover:text-orange-700 transition-all active:scale-95',
                  saving && 'opacity-50'
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => submit(topic)}
            disabled={saving}
            className="mt-2.5 text-xs text-stone-400 hover:text-stone-600"
          >
            Skip
          </button>
        </>
      )}
    </div>
  );
}
