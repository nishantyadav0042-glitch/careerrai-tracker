'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { KNOWLEDGE_GRAPH, type CoverageSectionId, type KnowledgeSection } from '@/lib/topics-constants';
import { Rai, RAI_LEVELS } from '@/components/mascots';

// ── The companion trail ──────────────────────────────────────────────────────
// Founder vision (drawn on a screenshot): as the student taps topics, a line
// weaves DOWN the list through the exact cells they tapped — like a workflow
// slowly building their plan — with a little character riding its tip.
// v3 (founder, 14 July, final): ONE original mascot — Rai, CareerRai's own
// buddy — rides the whole trail and LEVELS UP each step, gaining one piece
// of gear ("next kya milega?" replaces "next kaun aayega?"). No borrowed
// characters, no borrowed names; the finale shows the Lv1→Lv9 evolution.

const SECTION_TRAIL: Record<string, string> = {
  VARC: '#0f766e', DILR: '#2563eb', QA: '#ea580c', MOCKS: '#7c3aed', READING: '#059669',
};

// Smooth vertical S-curves through the tapped cells — the hand-drawn weave.
function trailPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]; const b = pts[i]; const my = (a.y + b.y) / 2;
    d += ` C ${a.x} ${my}, ${b.x} ${my}, ${b.x} ${b.y}`;
  }
  return d;
}

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
  // Pre-auth reuse (the /start funnel): no session exists yet to POST
  // /api/coverage against, so the final step hands the built matrix back
  // to the caller instead of saving it, and the caller persists it once an
  // account exists. Default false preserves the existing post-login path
  // byte-for-byte.
  deferSave?: boolean;
  onMatrixReady?: (matrix: { section: CoverageSectionId; topic: string; status: DeclaredStatus }[]) => void;
  // Display-order override (e.g. DILR before VARC) — the SAVED matrix always
  // iterates KNOWLEDGE_GRAPH's canonical order regardless, so reordering here
  // only changes what the student sees first.
  sectionOrder?: CoverageSectionId[];
  // One motivating line shown under the title on a section's first sub-step
  // only (QA's five clusters share one intro, not five).
  sectionIntro?: Partial<Record<CoverageSectionId, string>>;
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

function buildSteps(order?: CoverageSectionId[]): MapStep[] {
  const sections = order
    ? order.map((id) => KNOWLEDGE_GRAPH.find((s) => s.id === id)).filter((s): s is KnowledgeSection => !!s)
    : KNOWLEDGE_GRAPH;
  return sections.flatMap((section) =>
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
}

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

export default function ScreenTopicCoverage({ onNext, onBack, canGoBack, isLoading, deferSave, onMatrixReady, sectionOrder, sectionIntro }: Props) {
  const draft = loadDraft();
  const steps = buildSteps(sectionOrder);
  const [stepIdx, setStepIdx] = useState(() => Math.min(draft?.stepIdx ?? 0, steps.length - 1));
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

  const step = steps[stepIdx];
  const isFirstSubstepOfSection = stepIdx === 0 || steps[stepIdx - 1].sectionId !== step.sectionId;
  const intro = isFirstSubstepOfSection ? sectionIntro?.[step.sectionId] : undefined;
  const isHabit = step.sectionId === 'MOCKS' || step.sectionId === 'READING';
  const options = isHabit ? HABIT_STATUS_OPTIONS : EXAM_STATUS_OPTIONS;
  const answeredOnStep = step.units.filter((u) => statuses[u] != null).length;
  const stepComplete = answeredOnStep === step.units.length;
  const remaining = step.units.length - answeredOnStep;

  // Whole-map totals (used for the finale banner).
  const allUnits = steps.flatMap((s) => s.units);
  const totalUnits = allUnits.length;

  // ── Companion trail state ──────────────────────────────────────────────
  const raiLevel = Math.min(stepIdx + 1, RAI_LEVELS.length);
  const nextLevel = RAI_LEVELS[Math.min(stepIdx + 1, RAI_LEVELS.length - 1)];
  const listRef = useRef<HTMLDivElement | null>(null);
  const [trailPts, setTrailPts] = useState<{ x: number; y: number }[]>([]);
  const [tapPulse, setTapPulse] = useState(0);

  // Measure the tapped cells (in list order, top→bottom) → the weave's points,
  // relative to the list container. Re-measured on every tap/step change.
  useEffect(() => {
    const c = listRef.current;
    if (!c) { setTrailPts([]); return; }
    const crect = c.getBoundingClientRect();
    const pts: { x: number; y: number }[] = [];
    for (const u of step.units) {
      const st = statuses[u];
      if (!st) continue;
      const label = `${u}: ${st}`.replace(/"/g, '\\"');
      const btn = c.querySelector(`button[aria-label="${label}"]`) as HTMLElement | null;
      if (!btn) continue;
      const r = btn.getBoundingClientRect();
      pts.push({ x: r.left - crect.left + r.width / 2, y: r.top - crect.top + r.height / 2 });
    }
    setTrailPts(pts);
  }, [statuses, stepIdx, step.units]);

  const declare = (unit: string, value: DeclaredStatus) => {
    setStatuses((prev) => ({ ...prev, [unit]: value }));
    setTapPulse((p) => p + 1); // companion hops to the tapped cell
    setTapStreak((prev) => (prev?.status === value ? { status: value, count: prev.count + 1 } : { status: value, count: 1 }));
    setCelebration(HONESTY_LINES[value](unit));
    if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
    celebrationTimer.current = setTimeout(() => setCelebration(null), 2600);
  };

  const unansweredUnits = step.units.filter((u) => statuses[u] == null);
  // Bulk-fill is only offered for POSITIVE claims (learning/practicing/revising) —
  // a repeater who's genuinely covered ground can move fast. "Haven't started"
  // has no one-tap shortcut on purpose: declaring a topic untouched must be a
  // deliberate per-topic tap, so nobody can zero-out a whole section to skim
  // past (which produced the all-"not started" lead cards the founder flagged).
  const showMomentumChip = tapStreak != null && tapStreak.count >= 3 && tapStreak.status !== 'not_started' && unansweredUnits.length > 0;

  const bulkFill = () => {
    if (!tapStreak) return;
    const value = tapStreak.status;
    const filling = [...unansweredUnits];
    setStatuses((prev) => {
      const next = { ...prev };
      for (const u of filling) next[u] = value;
      return next;
    });
    setTapPulse((p) => p + 1);
    const label = (isHabit ? HABIT_STATUS_OPTIONS : EXAM_STATUS_OPTIONS).find((o) => o.value === value)?.label ?? value;
    setCelebration(`✓ ${filling.length} topic${filling.length === 1 ? '' : 's'} marked "${label}". Tap any cell to correct one.`);
    if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
    celebrationTimer.current = setTimeout(() => setCelebration(null), 2600);
    setTapStreak(null);
  };

  const handleNext = async () => {
    if (!stepComplete) return;
    setTapStreak(null);
    if (stepIdx < steps.length - 1) {
      setCelebration(`✓ ${step.reward} Rai levels up: ${nextLevel.gear}`);
      if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
      celebrationTimer.current = setTimeout(() => setCelebration(null), 2600);
      setStepIdx(stepIdx + 1);
      return;
    }
    // Last step — the whole declared grid, built in canonical Knowledge
    // Graph order regardless of the display order shown above. Every unit
    // was explicitly tapped; there are no defaulted rows.
    const matrix = KNOWLEDGE_GRAPH.flatMap((s) =>
      s.groups.flatMap((g) => g.units.map((unit) => ({ section: s.id, topic: unit, status: statuses[unit] ?? 'not_started' })))
    );
    if (deferSave) {
      onMatrixReady?.(matrix);
      try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* best-effort */ }
      onNext({
        coverage_practicing: matrix.filter((m) => m.status === 'practicing' || m.status === 'revising').length,
        coverage_learning: matrix.filter((m) => m.status === 'learning').length,
        coverage_total: matrix.length,
      });
      return;
    }
    setSaving(true);
    setError(null);
    try {
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
        <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">Step {stepIdx + 1} of {steps.length}</p>
        <p className="text-[11px] text-stone-400">{step.units.length} topics · one tap each</p>
      </div>

      <div>
        {intro && <p className="mb-1 text-sm font-semibold text-stone-900">{intro}</p>}
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
        <div className="sticky top-0 z-10 -mx-1 bg-white/95 px-1 pb-1.5 pt-1.5 backdrop-blur-sm">
          {/* This section's companion + live count. The trail itself weaves
              through the tapped cells in the list below (founder-drawn design)
              — a new character joins on every section. */}
          <div className="mb-1.5 flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1 font-bold uppercase tracking-widest" style={{ color: SECTION_TRAIL[step.sectionId] ?? '#7c3aed' }}>
              <Rai size={18} level={raiLevel} /> Rai&apos;s trail · Lv {raiLevel}
            </span>
            <span className="font-semibold tabular-nums text-stone-400">{answeredOnStep}/{step.units.length} fed</span>
          </div>
          <div className={cn('grid items-end gap-1.5', isHabit ? 'grid-cols-3' : 'grid-cols-4')}>
            {options.map(({ value, dot }) => (
              <span key={value} className="text-center text-[10px] font-bold leading-tight text-stone-500">
                {dot} {SHORT_LABEL[value]}
              </span>
            ))}
          </div>
        </div>
        <div ref={listRef} className="relative">
          {/* Companion trail overlay — the line weaving through tapped cells,
              with the character riding its tip. Decorative: never blocks taps. */}
          <div className="pointer-events-none absolute inset-0 z-10">
            {trailPts.length >= 2 && (
              <svg className="h-full w-full">
                <path
                  d={trailPath(trailPts)}
                  fill="none"
                  stroke={SECTION_TRAIL[step.sectionId] ?? '#7c3aed'}
                  strokeWidth="4"
                  strokeLinecap="round"
                  opacity="0.55"
                />
              </svg>
            )}
            {trailPts.length > 0 && (
              <div
                className="absolute transition-all duration-500 ease-out"
                style={{
                  left: trailPts[trailPts.length - 1].x,
                  top: trailPts[trailPts.length - 1].y,
                  transform: 'translate(-50%, -85%)',
                }}
              >
                <span key={tapPulse} className="chr-hop inline-block">
                  <span className={cn('inline-block drop-shadow', stepComplete ? 'chr-party' : 'chr-idle')}>
                    <Rai size={36} level={raiLevel} />
                  </span>
                </span>
              </div>
            )}
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
      </div>

      {step.lesson && (
        <p className="text-[11px] text-stone-600 bg-orange-50 border border-orange-100 rounded-xl px-3 py-2 leading-relaxed">{step.lesson}</p>
      )}

      {/* Full-map finale — Rai's whole evolution line, Lv1 → Lv9. */}
      {stepComplete && stepIdx === steps.length - 1 && (
        <div className="rounded-2xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-center">
          <div className="chr-parade flex items-end justify-center gap-1">
            {RAI_LEVELS.map((l) => <Rai key={l.level} size={26} level={l.level} />)}
          </div>
          <p className="mt-1 text-sm font-bold text-violet-800">All {totalUnits} topics mapped — Rai hit final form! 🎉</p>
        </div>
      )}

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      {/* Sticky CTA — the coverage steps are the tallest screens in
          onboarding; Next/Back must never require scrolling (founder). */}
      <div className="sticky bottom-0 z-20 flex gap-3 bg-white/95 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
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
            stepComplete ? 'bg-stone-900 text-white hover:bg-stone-800' : 'bg-stone-200 text-stone-400 cursor-not-allowed'
          )}
        >
          {saving
            ? 'Saving…'
            : !stepComplete
            ? `${remaining} topic${remaining === 1 ? '' : 's'} left on this step`
            : stepIdx < steps.length - 1
            ? `Next: ${steps[stepIdx + 1].title} →`
            : 'Continue →'}
        </button>
      </div>

      <style>{`
        @keyframes chrIdle { 0%,100%{transform:translateY(-2px)} 50%{transform:translateY(2px)} }
        @keyframes chrHop { 0%{transform:scale(1)} 40%{transform:scale(1.45) rotate(-8deg)} 100%{transform:scale(1)} }
        @keyframes chrParty { 0%,100%{transform:rotate(0) scale(1)} 20%{transform:rotate(-16deg) scale(1.25)} 40%{transform:rotate(14deg) scale(1.3)} 60%{transform:rotate(-10deg) scale(1.2)} 80%{transform:rotate(6deg) scale(1.1)} }
        @keyframes chrParade { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
        .chr-idle{animation:chrIdle 1.5s ease-in-out infinite}
        .chr-hop{animation:chrHop .45s ease-out}
        .chr-party{animation:chrParty .9s ease-in-out infinite}
        .chr-parade{animation:chrParade .7s ease-in-out infinite}
        @media (prefers-reduced-motion:reduce){.chr-idle,.chr-hop,.chr-party,.chr-parade{animation:none!important}}
      `}</style>
    </div>
  );
}
