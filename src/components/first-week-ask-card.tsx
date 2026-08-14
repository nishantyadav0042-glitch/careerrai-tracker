'use client';

import { useEffect, useState } from 'react';
import { nextAsk, type AskContext, type AskId } from '@/lib/first-week-asks';
import { QA_GROUPS } from '@/lib/topics-constants';
import { TOPICS_BY_SECTION } from '@/lib/day-topics';
import { getLogDateString } from '@/lib/streak-utils';

// ── The rest of the questions, one a day ────────────────────────────────────
//
// Founder, 14 Aug: "ask weakest section in onboarding, rest in first week."
//
// lib/first-week-asks decides WHETHER and WHICH question to show; this is the
// only place that decides HOW to ask it and where the answer goes. Skipping is
// deliberately client-only and per-day — it does NOT write to the profile.
// These fields cannot honestly distinguish "asked and declined" from "never
// asked" once both are a NULL column (unlike the onboarding weakest-section
// screen, which is shown exactly once, ever, so that ambiguity never arises
// there). So a skip here just means "not today"; the question returns another
// day within the first week, and after FIRST_WEEK_DAYS we simply stop asking
// rather than pretend to remember a decline we cannot actually record.

interface Props {
  weakestSection: string;
  daysSinceSignup: number;
  daysLogged: number;
  answered: Partial<Record<string, string | null>>;
}

const STAGES: { value: string; label: string }[] = [
  { value: 'not_started', label: "Haven't started" },
  { value: 'concepts', label: 'Learning concepts' },
  { value: 'questions', label: 'Solving questions' },
  { value: 'sectionals', label: 'Sectional tests' },
  { value: 'mocks', label: 'Full mocks' },
];

function todayKey(): string {
  return getLogDateString();
}

function loadDismissedToday(): AskId[] {
  try {
    const raw = window.localStorage.getItem('cr_fwa_dismissed');
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { day: string; ids: AskId[] };
    return parsed.day === todayKey() ? parsed.ids : [];
  } catch { return []; }
}

function saveDismissed(ids: AskId[]) {
  try {
    window.localStorage.setItem('cr_fwa_dismissed', JSON.stringify({ day: todayKey(), ids }));
  } catch { /* best-effort */ }
}

export function FirstWeekAskCard({ weakestSection, daysSinceSignup, daysLogged, answered }: Props) {
  const [dismissedToday, setDismissedToday] = useState<AskId[]>([]);
  const [askedTodayLocal, setAskedTodayLocal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  /* eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage read is client-only */
  useEffect(() => { setDismissedToday(loadDismissedToday()); }, []);

  const ctx: AskContext = {
    daysSinceSignup,
    daysLogged,
    answered,
    dismissedToday,
    askedToday: askedTodayLocal,
  };
  const ask = done ? null : nextAsk(ctx);
  if (!ask) return null;

  const weakSectionTopics = TOPICS_BY_SECTION[weakestSection as keyof typeof TOPICS_BY_SECTION]
    ?? TOPICS_BY_SECTION.DILR;

  async function submit(value: string) {
    setSaving(true);
    try {
      const res = await fetch('/api/student/first-week-ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ask!.id, value }),
      });
      if (res.ok) setDone(true);
    } finally {
      setSaving(false);
    }
  }

  function skip() {
    const next = [...dismissedToday, ask!.id];
    setDismissedToday(next);
    saveDismissed(next);
    setAskedTodayLocal(true);
  }

  return (
    <div className="mb-1.5 rounded-xl border border-orange-100 bg-orange-50/60 px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-orange-500">One quick thing</p>
      <p className="mt-0.5 text-[13px] font-bold leading-snug text-stone-900">{ask.question}</p>
      <p className="text-[11px] text-stone-500">{ask.why}</p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {ask.id === 'weak_topic' && weakSectionTopics.map((topic) => (
          <button
            key={topic}
            type="button"
            disabled={saving}
            onClick={() => void submit(topic)}
            className="rounded-full border border-orange-200 bg-white px-2.5 py-1 text-[11px] font-medium text-stone-700 transition-transform active:scale-95 disabled:opacity-50"
          >
            {topic}
          </button>
        ))}

        {ask.id === 'current_stage' && STAGES.map((s) => (
          <button
            key={s.value}
            type="button"
            disabled={saving}
            onClick={() => void submit(s.value)}
            className="rounded-full border border-orange-200 bg-white px-2.5 py-1 text-[11px] font-medium text-stone-700 transition-transform active:scale-95 disabled:opacity-50"
          >
            {s.label}
          </button>
        ))}

        {ask.id === 'start_with' && QA_GROUPS.map((g) => (
          <button
            key={g.label}
            type="button"
            disabled={saving}
            onClick={() => void submit(g.label)}
            className="rounded-full border border-orange-200 bg-white px-2.5 py-1 text-[11px] font-medium text-stone-700 transition-transform active:scale-95 disabled:opacity-50"
          >
            {g.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={skip}
        disabled={saving}
        className="mt-1.5 text-[11px] font-medium text-stone-400 hover:text-stone-600 disabled:opacity-50"
      >
        Not now
      </button>
    </div>
  );
}
