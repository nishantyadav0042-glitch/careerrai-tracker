'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { QUANT_TOPICS, VERBAL_TOPICS, LRDI_TOPICS } from '@/lib/topics-constants';

type Section = 'VARC' | 'DILR' | 'QA';
type Status = 'not_started' | 'started' | 'completed' | 'strong';

interface Props {
  onNext: (data?: Record<string, unknown>) => void;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

const SECTION_ORDER: Section[] = ['VARC', 'DILR', 'QA'];
const TOPICS_BY_SECTION: Record<Section, string[]> = {
  VARC: VERBAL_TOPICS,
  DILR: LRDI_TOPICS,
  QA: QUANT_TOPICS,
};
const SECTION_FULL_NAME: Record<Section, string> = {
  VARC: 'Verbal Ability & Reading Comprehension',
  DILR: 'Data Interpretation & Logical Reasoning',
  QA: 'Quantitative Aptitude',
};

// Explicit four-state choice per topic — visible labels, one tap each, no
// tap-to-cycle guesswork. Everything starts at "Not yet" because that's the
// only honest default: nothing here is inferred from stage or anything
// else. One earlier version marked all 14 topics "completed" from a single
// "I'm solving questions" tap — a fabricated coverage picture. Never again.
const STATUS_OPTIONS: { value: Status; label: string; active: string }[] = [
  { value: 'not_started', label: 'Not yet',   active: 'bg-stone-600 border-stone-600 text-white' },
  { value: 'started',     label: 'Started',   active: 'bg-amber-500 border-amber-500 text-white' },
  { value: 'completed',   label: 'Done once', active: 'bg-teal-600 border-teal-600 text-white' },
  { value: 'strong',      label: 'Strong',    active: 'bg-orange-600 border-orange-600 text-white' },
];

export default function ScreenTopicCoverage({ onNext, onBack, canGoBack, isLoading }: Props) {
  const [sectionIdx, setSectionIdx] = useState(0);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const section = SECTION_ORDER[sectionIdx];
  const topics = TOPICS_BY_SECTION[section];
  const keyOf = (s: Section, t: string) => `${s}:${t}`;
  const statusOf = (s: Section, t: string): Status => statuses[keyOf(s, t)] ?? 'not_started';

  const allTopicsCount = SECTION_ORDER.reduce((n, s) => n + TOPICS_BY_SECTION[s].length, 0);
  const touchedCount = Object.values(statuses).filter((v) => v !== 'not_started').length;

  const setStatus = (s: Section, t: string, v: Status) => {
    setStatuses((prev) => ({ ...prev, [keyOf(s, t)]: v }));
  };

  const handleContinue = async () => {
    if (sectionIdx < SECTION_ORDER.length - 1) {
      setSectionIdx(sectionIdx + 1);
      return;
    }
    // Last section — persist the WHOLE declared grid in one call, including
    // explicit not_started rows, so the engine knows "mapped and empty" from
    // "never mapped."
    setSaving(true);
    setError(null);
    try {
      const matrix = SECTION_ORDER.flatMap((s) =>
        TOPICS_BY_SECTION[s].map((t) => ({ section: s, topic: t, status: statusOf(s, t) }))
      );
      const res = await fetch('/api/coverage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matrix }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string })?.error ?? 'Could not save your coverage.');
      }
      const doneCount = matrix.filter((m) => m.status === 'completed' || m.status === 'strong').length;
      const startedCount = matrix.filter((m) => m.status === 'started').length;
      onNext({ coverage_done: doneCount, coverage_started: startedCount, coverage_total: matrix.length });
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Could not save your coverage.');
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (sectionIdx > 0) setSectionIdx(sectionIdx - 1);
    else onBack();
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-stone-600 leading-relaxed">
          Be brutally honest — <span className="font-semibold text-stone-800">&ldquo;Not yet&rdquo; on everything is a perfectly good answer.</span>{' '}
          Your plan is only as real as this screen.
        </p>
      </div>

      {/* Section stepper: VARC → DILR → QA */}
      <div className="flex items-center gap-2">
        {SECTION_ORDER.map((s, i) => (
          <div key={s} className="flex-1">
            <div className={cn('h-1 rounded-full mb-1', i < sectionIdx ? 'bg-teal-500' : i === sectionIdx ? 'bg-orange-500' : 'bg-stone-200')} />
            <p className={cn('text-[10px] font-bold text-center', i === sectionIdx ? 'text-orange-600' : 'text-stone-400')}>{s}</p>
          </div>
        ))}
      </div>

      <div>
        <p className="text-xs font-semibold text-stone-500 uppercase tracking-widest">{section}</p>
        <p className="text-[11px] text-stone-400">{SECTION_FULL_NAME[section]}</p>
      </div>

      <div className="space-y-3">
        {topics.map((topic) => {
          const current = statusOf(section, topic);
          return (
            <div key={topic} className="rounded-xl border border-stone-200 p-3">
              <p className="text-sm font-semibold text-stone-800 mb-2">{topic}</p>
              <div className="grid grid-cols-4 gap-1.5">
                {STATUS_OPTIONS.map(({ value, label, active }) => (
                  <button
                    key={value}
                    disabled={saving || isLoading}
                    onClick={() => setStatus(section, topic, value)}
                    className={cn(
                      'rounded-lg border py-1.5 px-1 text-[11px] font-semibold transition-all active:scale-95',
                      current === value ? active : 'bg-white border-stone-200 text-stone-500 hover:border-stone-300'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {touchedCount > 0 && (
        <p className="text-xs text-stone-500 text-center">
          {touchedCount} of {allTopicsCount} topics marked so far
        </p>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      <div className="flex gap-3 pt-1">
        {(canGoBack || sectionIdx > 0) && (
          <button onClick={handleBack} disabled={saving} className="flex-1 py-3 border border-stone-300 rounded-xl text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors">
            Back
          </button>
        )}
        <button
          onClick={handleContinue}
          disabled={saving || isLoading}
          className="flex-1 py-3 rounded-xl font-semibold text-sm bg-orange-600 text-white hover:bg-orange-700 transition-all active:scale-[0.98] disabled:opacity-50"
        >
          {saving ? 'Saving…' : sectionIdx < SECTION_ORDER.length - 1 ? `Next: ${SECTION_ORDER[sectionIdx + 1]} →` : 'Lock my coverage →'}
        </button>
      </div>
    </div>
  );
}
