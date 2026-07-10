'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { KNOWLEDGE_GRAPH, type CoverageSectionId } from '@/lib/topics-constants';

// Student-declared states — including 'revising' ("Revision started"), the
// per-topic state that replaced the old Revision pseudo-section. exam_ready
// (🟢) is earned through confidence signals, never self-assigned; revision
// DUE is derived.
type DeclaredStatus = 'not_started' | 'learning' | 'practicing' | 'revising';

interface Props {
  onNext: (data?: Record<string, unknown>) => void;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

const EXAM_STATUS_OPTIONS: { value: DeclaredStatus; dot: string; label: string; active: string }[] = [
  { value: 'not_started', dot: '⚪', label: "Haven't started", active: 'bg-stone-600 border-stone-600 text-white' },
  { value: 'learning',    dot: '🟡', label: 'Learning concepts', active: 'bg-amber-500 border-amber-500 text-white' },
  { value: 'practicing',  dot: '🔵', label: 'Practicing questions', active: 'bg-blue-600 border-blue-600 text-white' },
  { value: 'revising',    dot: '🟠', label: 'Revision started', active: 'bg-orange-600 border-orange-600 text-white' },
];
// Habit tracks (mocks, reading) don't have a revision stage — three states.
const HABIT_STATUS_OPTIONS = EXAM_STATUS_OPTIONS.slice(0, 3);

// Compact column-legend labels for the matrix header.
const SHORT_LABEL: Record<DeclaredStatus, string> = {
  not_started: 'Not started',
  learning: 'Learning',
  practicing: 'Practicing',
  revising: 'Revising',
};

// Honesty is what gets celebrated — never knowledge. One short line each
// (founder rule: nobody reads paragraphs mid-flow).
const HONESTY_LINES: Record<DeclaredStatus, (unit: string) => string> = {
  not_started: (u) => `Good. The plan won't waste time assuming you know ${u}.`,
  learning: (u) => `${u} stays in concept mode — questions come after.`,
  practicing: (u) => `${u} goes into your practice rotation.`,
  revising: (u) => `${u} enters your revision cycle.`,
};

// One step per group — the student never sees the whole graph at once and
// never has to open anything manually; finishing a step advances to the
// next automatically. QA's five clusters are five separate, short steps.
interface MapStep {
  sectionId: CoverageSectionId;
  title: string;
  subtitle: string | null;
  units: string[];
  reward: string;
  lesson: string | null;
}

const STEPS: MapStep[] = KNOWLEDGE_GRAPH.flatMap((section) =>
  section.groups.map((group) => ({
    sectionId: section.id,
    title: group.label ? `${section.label} · ${group.label}` : section.label,
    subtitle: group.label,
    units: group.units,
    reward: '',
    lesson: null,
  }))
).map((step) => ({
  ...step,
  reward:
    step.sectionId === 'VARC' ? 'VARC mapped — the plan now knows where to start you and what to skip.'
    : step.sectionId === 'DILR' ? 'DILR mapped — set selection just got personal.'
    : step.sectionId === 'MOCKS' ? 'Mock prep mapped — your test-readiness now has a baseline.'
    : step.sectionId === 'READING' ? 'Reading habits mapped — the highest-leverage VARC input is on record.'
    : `${step.title.replace('QA · ', '')} mapped — your Quant plan just got sharper.`,
  lesson:
    step.title === 'VARC' ? '💡 Reading Comprehension carries most VARC marks — a daily reading habit moves this section more than any drill.'
    : step.title === 'DILR' ? '💡 DILR is a set-selection game: choosing the right 2 sets to attempt matters more than raw speed.'
    : step.title === 'QA · Algebra' ? '💡 Arithmetic + Algebra contribute the majority of CAT Quant questions. Good thing we mapped these carefully.'
    : null,
}));

// Every unit REQUIRES an explicit tap — nothing is pre-filled, so nothing
// can be skimmed past. People abandon uncertainty, not effort: each step is
// small, priced, and finishes itself.
// This is the longest, most-tapped step in onboarding (~53 taps across 9
// sub-steps) and previously saved nothing until the very last tap — closing
// the tab, losing connection, or the app backgrounding mid-flow silently
// discarded the entire map. Mirrored to localStorage on every tap so a
// reload resumes instead of restarting; cleared once the real save succeeds.
const DRAFT_KEY = 'cr_onboarding_topic_coverage_draft';

function loadDraft(): { stepIdx: number; statuses: Record<string, DeclaredStatus> } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.stepIdx !== 'number' || typeof parsed?.statuses !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export default function ScreenTopicCoverage({ onNext, onBack, canGoBack, isLoading }: Props) {
  const draft = loadDraft();
  const [stepIdx, setStepIdx] = useState(() => Math.min(draft?.stepIdx ?? 0, STEPS.length - 1));
  const [statuses, setStatuses] = useState<Record<string, DeclaredStatus>>(() => draft?.statuses ?? {});
  const [celebration, setCelebration] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Momentum chip: after 3 identical taps in a row within a step, offer a
  // one-tap "mark the rest as X" — explicit honest bulk-fill (the student
  // says it; we never assume it). Resets on step change or a different tap.
  const [tapStreak, setTapStreak] = useState<{ status: DeclaredStatus; count: number } | null>(null);
  const celebrationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => () => { if (celebrationTimer.current) clearTimeout(celebrationTimer.current); }, []);
  // New step — jump back to the top so it reads like a fresh screen.
  useEffect(() => { scrollRef.current?.scrollIntoView({ block: 'start' }); }, [stepIdx]);
  // Mirror every tap and every step change to the draft so a reload resumes.
  useEffect(() => {
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ stepIdx, statuses }));
    } catch {
      // Private browsing / storage full — best-effort only, not launch-critical.
    }
  }, [stepIdx, statuses]);

  const step = STEPS[stepIdx];
  const isHabit = step.sectionId === 'MOCKS' || step.sectionId === 'READING';
  const options = isHabit ? HABIT_STATUS_OPTIONS : EXAM_STATUS_OPTIONS;
  const answeredOnStep = step.units.filter((u) => statuses[u] != null).length;
  const stepComplete = answeredOnStep === step.units.length;
  const remaining = step.units.length - answeredOnStep;

  const declare = (unit: string, value: DeclaredStatus) => {
    setStatuses((prev) => ({ ...prev, [unit]: value }));
    setTapStreak((prev) => (prev?.status === value ? { status: value, count: prev.count + 1 } : { status: value, count: 1 }));
    setCelebration(HONESTY_LINES[value](unit));
    if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
    celebrationTimer.current = setTimeout(() => setCelebration(null), 2600);
  };

  const unansweredUnits = step.units.filter((u) => statuses[u] == null);
  const showMomentumChip = tapStreak != null && tapStreak.count >= 3 && unansweredUnits.length > 0;

  const bulkFill = () => {
    if (!tapStreak) return;
    const value = tapStreak.status;
    const filling = [...unansweredUnits];
    setStatuses((prev) => {
      const next = { ...prev };
      for (const u of filling) next[u] = value;
      return next;
    });
    const label = (isHabit ? HABIT_STATUS_OPTIONS : EXAM_STATUS_OPTIONS).find((o) => o.value === value)?.label ?? value;
    setCelebration(`✓ ${filling.length} topic${filling.length === 1 ? '' : 's'} marked "${label}". Tap any cell to correct one.`);
    if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
    celebrationTimer.current = setTimeout(() => setCelebration(null), 2600);
    setTapStreak(null);
  };

  const handleNext = async () => {
    if (!stepComplete) return;
    setTapStreak(null);
    if (stepIdx < STEPS.length - 1) {
      setCelebration(`✓ ${step.reward}`);
      if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
      celebrationTimer.current = setTimeout(() => setCelebration(null), 2600);
      setStepIdx(stepIdx + 1);
      return;
    }
    // Last step — persist the whole declared grid in one call. Every unit
    // was explicitly tapped; there are no defaulted rows.
    setSaving(true);
    setError(null);
    try {
      const matrix = KNOWLEDGE_GRAPH.flatMap((s) =>
        s.groups.flatMap((g) => g.units.map((unit) => ({ section: s.id, topic: unit, status: statuses[unit] ?? 'not_started' })))
      );
      const res = await fetch('/api/coverage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matrix }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string })?.error ?? 'Could not save your preparation map.');
      }
      try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* best-effort */ }
      onNext({
        coverage_practicing: matrix.filter((m) => m.status === 'practicing' || m.status === 'revising').length,
        coverage_learning: matrix.filter((m) => m.status === 'learning').length,
        coverage_total: matrix.length,
      });
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Could not save your preparation map.');
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    setTapStreak(null);
    if (stepIdx > 0) setStepIdx(stepIdx - 1);
    else onBack();
  };

  return (
    <div ref={scrollRef} className="space-y-4">
      {/* Step header: where you are + how small this step is */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">Step {stepIdx + 1} of {STEPS.length}</p>
        <p className="text-[11px] text-stone-400">{step.units.length} topics · one tap each</p>
      </div>
      <div className="flex gap-0.5">
        {STEPS.map((_, i) => (
          <div key={i} className={cn('flex-1 h-1 rounded-full', i < stepIdx ? 'bg-teal-500' : i === stepIdx ? 'bg-orange-500' : 'bg-stone-200')} />
        ))}
      </div>

      <div>
        <p className="text-base font-bold text-stone-900">{step.title}</p>
        <p className="text-xs text-stone-500">Overclaiming wastes revision. Underclaiming wastes weeks.</p>
      </div>

      {/* Honesty celebration — one live slot */}
      <div aria-live="polite" className={cn('transition-opacity duration-300', celebration ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden')}>
        {celebration && (
          <p className="text-xs text-teal-700 bg-teal-50 border border-teal-200 rounded-xl px-3 py-2 leading-relaxed">{celebration}</p>
        )}
      </div>

      {/* Momentum chip — honest bulk-fill after 3 identical taps. */}
      {showMomentumChip && tapStreak && (
        <button
          type="button"
          onClick={bulkFill}
          disabled={saving || isLoading}
          className="w-full rounded-xl border border-teal-300 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-800 transition-all hover:bg-teal-100 active:scale-[0.98]"
        >
          Mark the remaining {unansweredUnits.length} as {options.find((o) => o.value === tapStreak.status)?.dot}{' '}
          {options.find((o) => o.value === tapStreak.status)?.label}?
        </button>
      )}

      {/* Matrix: rows = topics, columns = statuses. Same answer always lives
          in the same column (muscle memory = speed), the legend is sticky so
          labels never scroll away (accuracy), and every row still needs its
          own explicit tap — the no-prefill doctrine survives. */}
      <div>
        <div className="sticky top-0 z-10 -mx-1 bg-white/95 px-1 pb-1.5 pt-1 backdrop-blur-sm">
          <div className={cn('grid items-end gap-1.5', isHabit ? 'grid-cols-3' : 'grid-cols-4')}>
            {options.map(({ value, dot }) => (
              <span key={value} className="text-center text-[10px] font-bold leading-tight text-stone-500">
                {dot} {SHORT_LABEL[value]}
              </span>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          {step.units.map((unit) => {
            const current = statuses[unit] ?? null;
            return (
              <div
                key={unit}
                className={cn(
                  'rounded-lg border px-2 py-1.5',
                  current == null ? 'border-orange-200 bg-orange-50/40' : 'border-stone-100'
                )}
              >
                {/* Full-width name line — never truncated (a topic you can't
                    read is a topic you can't honestly rate). Cells align with
                    the sticky legend above. */}
                <p className="mb-1 text-[12px] font-semibold leading-snug text-stone-800">{unit}</p>
                <div className={cn('grid gap-1.5', isHabit ? 'grid-cols-3' : 'grid-cols-4')}>
                  {options.map(({ value, dot, active }) => (
                    <button
                      key={value}
                      disabled={saving || isLoading}
                      onClick={() => declare(unit, value)}
                      aria-label={`${unit}: ${value}`}
                      className={cn(
                        'flex h-9 w-full items-center justify-center rounded-lg border text-sm transition-all active:scale-90',
                        current === value ? active : 'border-stone-200 bg-white hover:border-stone-300'
                      )}
                    >
                      {current === value ? dot : <span className="h-2 w-2 rounded-full bg-stone-200" />}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {step.lesson && (
        <p className="text-[11px] text-stone-600 bg-orange-50 border border-orange-100 rounded-xl px-3 py-2 leading-relaxed">{step.lesson}</p>
      )}

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      <div className="flex gap-3 pt-1">
        {(canGoBack || stepIdx > 0) && (
          <button onClick={handleBack} disabled={saving} className="flex-1 py-3 border border-stone-300 rounded-xl text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors">
            Back
          </button>
        )}
        <button
          onClick={handleNext}
          disabled={!stepComplete || saving || isLoading}
          className={cn(
            'flex-1 py-3 rounded-xl font-semibold text-sm transition-all active:scale-[0.98]',
            stepComplete ? 'bg-orange-600 text-white hover:bg-orange-700' : 'bg-stone-200 text-stone-400 cursor-not-allowed'
          )}
        >
          {saving
            ? 'Saving…'
            : !stepComplete
            ? `${remaining} topic${remaining === 1 ? '' : 's'} left on this step`
            : stepIdx < STEPS.length - 1
            ? `Next: ${STEPS[stepIdx + 1].title} →`
            : 'Continue →'}
        </button>
      </div>
    </div>
  );
}
