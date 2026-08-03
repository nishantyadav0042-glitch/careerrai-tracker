'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Loader2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { track } from '@/lib/journey';
import { setLogModalOpen } from '@/lib/first-run-events';
import type { MockDebriefData } from './MockDebriefModal';
import { OUTCOME_OPTIONS, type DayOutcome } from '@/lib/check-in';

// Today's plan tasks, pulled into the log so "what did you cover" IS the plan.
interface PlanTask { id: string; section: string; topic: string | null; label: string; target: string | null; }

interface LoggingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: LoggingData) => Promise<{ mockSelected: boolean }>;
  isSubmitting?: boolean;
}

export interface LoggingData {
  /**
   * Hours the student STATED. `null` means they left the optional row alone —
   * which is NOT zero, and the API preserves whatever is already recorded when
   * it sees null. Flattening these two with `?? 0` is what erased hours already
   * earned by completing planned tasks (28 days, 20 students).
   */
  hours: number | null;
  sections: string[];
  energy: string; // kept for the log RPC contract; defaulted, not asked
  plan_fit?: string;        // 'easy' | 'right' | 'too_much' | 'couldnt_finish'
  blocker_reason?: string;  // only when plan_fit = 'couldnt_finish'
  confidence?: number;      // 1-5, one tap
  // Plan tasks to complete, with how far they got: 'green' = fully done,
  // 'blue' = half done. Absent = uncover a previously-done task.
  completedTasks?: { id: string; confidence?: 'green' | 'blue' }[];
  // Mock debrief captured INLINE on this same sheet (null when no mock today).
  mock?: MockDebriefData | null;
  // How the day actually went — the first question on the sheet.
  day_outcome?: DayOutcome;
}

// Founder redesign (24 Jul): one sheet, all taps, completion-first. A student
// should never enter data unless it changes tomorrow's plan — so no energy, no
// mood, no notes. Order: what got done → what happened off-plan → how the plan
// felt (+ why, if unfinished) → hours (optional) → mock (folded in, no second
// screen) → one confidence tap.
const HOURS_OPTIONS = [0, 2, 4, 6, 8, 10];
const OFF_PLAN_SECTIONS = ['QA', 'VARC', 'DILR', 'Revision', 'Other'];

const PLAN_FIT = [
  { value: 'easy', label: 'Easy', hint: '😌' },
  { value: 'right', label: 'Right', hint: '👍' },
  { value: 'too_much', label: 'Too much', hint: '😮‍💨' },
  { value: 'couldnt_finish', label: "Couldn't finish", hint: '🚧' },
];
const BLOCKER_REASONS = [
  { value: 'college', label: 'College' },
  { value: 'office', label: 'Office' },
  { value: 'travel', label: 'Travel' },
  { value: 'health', label: 'Health' },
  { value: 'family', label: 'Family' },
  { value: 'procrastination', label: 'Procrastination' },
  { value: 'mock_ran_long', label: 'Mock ran long' },
  { value: 'plan_too_heavy', label: 'Plan too heavy' },
  { value: 'other', label: 'Other' },
];

type TaskState = 'half' | 'full';

// ── The day's shape, asked FIRST ────────────────────────────────────────────
//
// Before this, a student who hadn't studied had to scroll past the plan, past
// the off-plan picker, past the mock question, and tap "0" in the hours row —
// because hours === 0 was the only thing that made the form valid for them.
// The honest path was the hidden one. That is how a log ends up filled only by
// students who studied, and a dataset that says everybody is doing fine.
//
// Four states because real days have four states. 'partial' matters as much as
// the rest: "I sat down and didn't finish" is the most common honest day, and
// the one a two-option form silently pushes into a lie.
// Re-exported for any existing importer; the definition lives in lib/check-in,
// which is also where the server's allow-list reads it from. Declaring it here
// as well is how the two surfaces drifted in the first place.
export type { DayOutcome };

// The four answers come from lib/check-in — the same array the check-in gate
// renders. This file used to declare its own copy, and the two had drifted in
// three of four sub-lines, so the gate and this sheet asked one question in two
// voices. Only the COLOUR is local: tone is presentation, and the leaf
// vocabulary module has no business knowing Tailwind.
const OUTCOME_TONE: Record<DayOutcome, string> = {
  studied: 'emerald',
  partial: 'amber',
  not_studied: 'zinc',
  skipped: 'zinc',
};
const OUTCOMES = OUTCOME_OPTIONS.map((o) => ({ ...o, tone: OUTCOME_TONE[o.id] }));

/** The two answers that need nothing else — one tap and the day is recorded. */
const NO_DETAIL_NEEDED: DayOutcome[] = ['not_studied', 'skipped'];

export function LoggingModal({ isOpen, onClose, onSubmit, isSubmitting = false }: LoggingModalProps) {
  const [outcome, setOutcome] = useState<DayOutcome | null>(null);
  const [planTasks, setPlanTasks] = useState<PlanTask[]>([]);
  const [taskChoice, setTaskChoice] = useState<Map<string, TaskState>>(new Map());
  const [initialDoneIds, setInitialDoneIds] = useState<Set<string>>(new Set());
  const [offSections, setOffSections] = useState<string[]>([]);
  const [planFit, setPlanFit] = useState<string | null>(null);
  const [blockerReason, setBlockerReason] = useState<string | null>(null);
  const [hours, setHours] = useState<number | null>(null);
  const [mockTaken, setMockTaken] = useState<boolean | null>(null);
  // Inline mock percentiles (only when mockTaken === true)
  const [mockOverall, setMockOverall] = useState<string>('');
  const [mockVarc, setMockVarc] = useState<string>('');
  const [mockDilr, setMockDilr] = useState<string>('');
  const [mockQa, setMockQa] = useState<string>('');
  const [mockNote, setMockNote] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [blockedHint, setBlockedHint] = useState<string | null>(null);
  // When this open began, and whether it ended in a save. Used to measure
  // abandonment — half the students who open this never finish it, and until
  // now nothing recorded what they had filled in when they walked away.
  const openedAt = useRef<number>(0);
  const savedRef = useRef(false);

  useEffect(() => {
    setLogModalOpen(isOpen);
    if (isOpen) { openedAt.current = Date.now(); savedRef.current = false; track('log_open'); }
    return () => setLogModalOpen(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/routine/today');
        if (!res.ok) return;
        const json = await res.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawTasks = (json?.routine?.tasks ?? []) as any[];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const doneIds = new Set((json?.completions ?? []).map((c: any) => String(c.task_id)));
        if (cancelled) return;
        setPlanTasks(rawTasks.map((t) => ({ id: String(t.id), section: t.section, topic: t.topic ?? null, label: String(t.label ?? ''), target: t.target ?? null })));
        const done = new Set<string>(rawTasks.filter((t) => doneIds.has(String(t.id))).map((t) => String(t.id)));
        setInitialDoneIds(done);
        setTaskChoice(new Map([...done].map((id) => [id, 'full' as const])));
      } catch { /* best effort */ }
    })();
    return () => { cancelled = true; };
  }, [isOpen]);

  // Three-state tap: Not done (clear) / Half / Done.
  const setChoice = (id: string, choice: TaskState | null) => setTaskChoice((prev) => {
    const n = new Map(prev);
    if (choice === null) n.delete(id); else n.set(id, choice);
    return n;
  });

  // Completion-first: the log is valid the moment there's a real signal of the
  // day — a plan topic marked, something studied off-plan, a mock, or an honest
  // rest day (0 hours). Hours are optional; completion is the source of truth.
  // "Didn't study" and "Rest / away" are complete answers on their own — a day
  // with nothing in it has nothing further to describe, and making someone
  // justify a bad day is how you stop hearing about bad days.
  const outcomeIsTerminal = outcome != null && NO_DETAIL_NEEDED.includes(outcome);
  const isValid = outcomeIsTerminal
    || taskChoice.size > 0 || offSections.length > 0 || mockTaken === true || hours === 0;

  // The hint must name what is ACTUALLY missing. It used to say "Start by
  // tapping how today went" whenever the outcome was unanswered — but the
  // outcome has never been required (isValid above doesn't test it), so the hint
  // was inventing a mandatory first step and adding a tap to every save.
  // Founder call, 29 Jul (option A): don't block on the summary; the per-task
  // Not done / Half / Done chips already say how the day went, and when the
  // student skips the question we derive it from those instead of losing it.
  const missingHint = (): string =>
    'Tap how far you got on a plan topic, or pick what you studied under "Anything off today’s plan?"';

  // Derived outcome, used only when the student didn't tap one. Every branch is
  // checkable against what they actually marked — we never guess 'studied'.
  const deriveOutcome = (): DayOutcome | null => {
    const marks = [...taskChoice.values()];
    if (marks.length > 0 && marks.length >= planTasks.length && marks.every((m) => m === 'full')) {
      return 'studied';                                  // every plan topic finished
    }
    if (marks.length > 0 || offSections.length > 0 || mockTaken === true) {
      return 'partial';                                  // real work, not the whole plan
    }
    return null;                                         // nothing to infer from — stay silent
  };

  const handleSubmit = async () => {
    if (!isValid) {
      const hint = missingHint();
      setBlockedHint(hint);
      track('log_blocked', { hint, hasPlanTasks: planTasks.length > 0 });
      return;
    }
    setBlockedHint(null);
    navigator.vibrate?.(50);
    try {
      setError(null);
      const coveredTasks = planTasks.filter((t) => taskChoice.has(t.id));
      const derived = [...new Set([
        ...coveredTasks.map((t) => (t.section === 'General' ? 'Revision' : t.section)),
        ...offSections.filter((s) => s !== 'Other'), // 'Other' isn't a plan section — kept only as a signal
      ])];
      const finalSections = mockTaken ? [...derived.filter((s) => s !== 'Mock'), 'Mock'] : derived;

      const completedTasks: { id: string; confidence?: 'green' | 'blue' }[] = [];
      for (const t of planTasks) {
        const choice = taskChoice.get(t.id);
        const wasDone = initialDoneIds.has(t.id);
        if (choice && !wasDone) completedTasks.push({ id: t.id, confidence: choice === 'full' ? 'green' : 'blue' });
        else if (!choice && wasDone) completedTasks.push({ id: t.id });
      }

      const num = (s: string): number | null => {
        const n = parseFloat(s);
        return s.trim() !== '' && !isNaN(n) ? n : null;
      };
      const mock: MockDebriefData | null = mockTaken
        ? {
            overall_percentile: num(mockOverall),
            varc: { percentile: num(mockVarc) },
            dilr: { percentile: num(mockDilr) },
            qa: { percentile: num(mockQa) },
            strategy_note: mockNote.trim(),
          }
        : null;

      await onSubmit({
        // NULL, not 0, when the student left the hours row alone. `hours ?? 0`
        // here is what destroyed real study time: the server overwrites
        // study_duration with whatever arrives, so an untouched optional field
        // wiped hours already credited by completing planned tasks. Silence and
        // zero are different answers and the API now tells them apart.
        hours,
        sections: finalSections,
        energy: '💪', // defaulted — no longer asked
        plan_fit: planFit ?? undefined,
        blocker_reason: planFit === 'couldnt_finish' && blockerReason ? blockerReason : undefined,
        completedTasks,
        mock,
        // Their own answer wins; otherwise inferred from what they marked, so
        // skipping the summary question never costs us the signal that
        // plan-reason.ts and the adaptation engine read.
        day_outcome: outcome ?? deriveOutcome() ?? undefined,
      });

      // Reset
      setOutcome(null);
      setTaskChoice(new Map());
      setInitialDoneIds(new Set());
      setOffSections([]);
      setPlanFit(null);
      setBlockerReason(null);
      setHours(null);
      setMockTaken(null);
      setMockOverall(''); setMockVarc(''); setMockDilr(''); setMockQa(''); setMockNote('');
      savedRef.current = true;
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't save that. Try again.";
      track('log_error', { message: msg });
      setError(msg);
    }
  };

  // Closing without saving. Records how far they actually got, so the
  // drop-off has a reason attached instead of being a silent exit.
  const handleClose = () => {
    if (!savedRef.current) {
      track('log_dismissed', {
        secondsOpen: openedAt.current ? Math.round((Date.now() - openedAt.current) / 1000) : null,
        planTasksOffered: planTasks.length,
        tasksMarked: taskChoice.size,
        offSections: offSections.length,
        planFitSet: planFit !== null,
        hoursSet: hours !== null,
        mockAnswered: mockTaken !== null,
        wasSubmittable: isValid,
        touchedAnything: taskChoice.size > 0 || offSections.length > 0 || planFit !== null || hours !== null || mockTaken !== null,
      });
    }
    onClose();
  };

  if (!isOpen) return null;

  const label = (s: string) => <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-3">{s}</label>;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 flex items-end sm:items-center sm:justify-center">
      <div className={cn('w-full max-w-md bg-zinc-950 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-zinc-800', 'max-h-[92vh] overflow-y-auto flex flex-col')}>
        <div className="sticky top-0 bg-zinc-950 border-b border-zinc-800 px-6 py-5 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Topics Studied Today</h2>
          <button onClick={handleClose} disabled={isSubmitting} className="text-zinc-500 hover:text-zinc-300 transition disabled:opacity-50">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 px-6 py-5 space-y-7">

          {/* 0 — How did today go? Asked first, answerable in one tap. */}
          <div>
            {label('How did today go?  ·  optional')}
            <div className="grid grid-cols-2 gap-2">
              {OUTCOMES.map((o) => {
                const on = outcome === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => { setOutcome(o.id); setBlockedHint(null); }}
                    className={cn(
                      'rounded-xl px-3 py-3 text-left transition-all active:scale-95',
                      on && o.tone === 'emerald' && 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25',
                      on && o.tone === 'amber' && 'bg-amber-500 text-white shadow-lg shadow-amber-500/25',
                      on && o.tone === 'zinc' && 'bg-zinc-500 text-white',
                      !on && 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700',
                    )}
                  >
                    <span className="block text-sm font-bold">{o.emoji} {o.label}</span>
                    <span className={cn('mt-0.5 block text-[11px] leading-snug', on ? 'text-white/80' : 'text-zinc-500')}>
                      {o.sub}
                    </span>
                  </button>
                );
              })}
            </div>
            {outcomeIsTerminal && (
              <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
                That&apos;s all we need — tap save. An honest empty day is worth more to your
                plan than a blank one, and your streak survives it.
              </p>
            )}
          </div>

          {/* Everything below is only relevant if something actually happened.
              A student who tapped "Didn't study" is done — asking them to
              scroll through a plan they didn't touch is how you teach someone
              to stop opening the log at all. */}
          {!outcomeIsTerminal && (
          <>

          {/* 1 — Today's plan (the source of truth) */}
          <div>
            {label("Today's plan")}
            {planTasks.length === 0 ? (
              <p className="text-xs text-zinc-500">No plan topics today — pick what you studied below.</p>
            ) : (
              <div className="space-y-2">
                {planTasks.map((t) => {
                  const choice = taskChoice.get(t.id) ?? null;
                  return (
                    <div key={t.id} className="rounded-xl bg-zinc-800 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{t.target || t.label}</span>
                        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-zinc-400">{t.section}</span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <button onClick={() => setChoice(t.id, null)}
                          className={cn('rounded-lg py-1.5 text-xs font-bold transition-colors', choice === null ? 'bg-zinc-600 text-white' : 'bg-zinc-700/50 text-zinc-400 hover:bg-zinc-700')}>
                          Not done
                        </button>
                        <button onClick={() => setChoice(t.id, 'half')}
                          className={cn('rounded-lg py-1.5 text-xs font-bold transition-colors', choice === 'half' ? 'bg-amber-500 text-white' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600')}>
                          Half
                        </button>
                        <button onClick={() => setChoice(t.id, 'full')}
                          className={cn('flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-bold transition-colors', choice === 'full' ? 'bg-emerald-500 text-white' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600')}>
                          {choice === 'full' && <Check className="h-3 w-3" strokeWidth={3} />} Done
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 2 — Anything off today's plan? (prevents coverage drift) */}
          <div>
            {label("Anything off today’s plan?")}
            <div className="grid grid-cols-5 gap-2">
              {OFF_PLAN_SECTIONS.map((s) => {
                const on = offSections.includes(s);
                return (
                  <button key={s} type="button"
                    onClick={() => setOffSections((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))}
                    className={cn('py-2.5 rounded-xl font-semibold text-xs transition-all active:scale-95', on ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700')}>
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3 — How did today's plan feel? (+ why, if unfinished) */}
          <div>
            {label("Today’s plan felt")}
            <div className="grid grid-cols-4 gap-2">
              {PLAN_FIT.map((o) => (
                <button key={o.value} type="button"
                  onClick={() => { setPlanFit((prev) => (prev === o.value ? null : o.value)); if (o.value !== 'couldnt_finish') setBlockerReason(null); }}
                  className={cn('flex flex-col items-center gap-1 py-2.5 rounded-2xl transition-all active:scale-95', planFit === o.value ? 'bg-zinc-700 ring-2 ring-orange-500' : 'bg-zinc-800 hover:bg-zinc-700')}>
                  <span className="text-lg">{o.hint}</span>
                  <span className="text-[10px] font-semibold text-zinc-300 text-center leading-tight">{o.label}</span>
                </button>
              ))}
            </div>
            {planFit === 'couldnt_finish' && (
              <div className="mt-3">
                <p className="mb-2 text-[11px] font-medium text-zinc-500">What got in the way?</p>
                <div className="flex flex-wrap gap-1.5">
                  {BLOCKER_REASONS.map((r) => (
                    <button key={r.value} type="button"
                      onClick={() => setBlockerReason((prev) => (prev === r.value ? null : r.value))}
                      className={cn('rounded-full px-3 py-1.5 text-xs font-semibold transition-all active:scale-95', blockerReason === r.value ? 'bg-orange-500 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700')}>
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 4 — Hours (optional) */}
          <div>
            {label('Hours studied · optional')}
            <div className="grid grid-cols-6 gap-1.5">
              {HOURS_OPTIONS.map((h) => (
                <button key={h} onClick={() => setHours((prev) => (prev === h ? null : h))}
                  className={cn('py-3 rounded-xl font-bold text-sm transition-all active:scale-95', hours === h ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700')}>
                  {h === 10 ? '10+' : `${h}`}
                </button>
              ))}
            </div>
          </div>

          {/* 5 — Mock (folded in, no second screen) */}
          <div className="rounded-2xl border border-teal-700/40 bg-teal-950/30 p-4">
            <label className="block text-sm font-bold text-white mb-3">Did you take a mock today?</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setMockTaken(false)}
                className={cn('py-3 rounded-xl font-semibold text-sm transition-all active:scale-95', mockTaken === false ? 'bg-zinc-700 text-white ring-2 ring-zinc-500' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700')}>
                No
              </button>
              <button type="button" onClick={() => setMockTaken(true)}
                className={cn('py-3 rounded-xl font-semibold text-sm transition-all active:scale-95', mockTaken === true ? 'bg-teal-500 text-white shadow-lg shadow-teal-500/30' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700')}>
                Yes, I gave a mock
              </button>
            </div>
            {mockTaken === true && (
              <div className="mt-4 space-y-3">
                <div>
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Overall percentile</p>
                  <input type="number" inputMode="numeric" min={0} max={100} value={mockOverall}
                    onChange={(e) => setMockOverall(e.target.value)} placeholder="e.g. 87"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-lg font-bold text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {([['VARC', mockVarc, setMockVarc], ['DILR', mockDilr, setMockDilr], ['QA', mockQa, setMockQa]] as const).map(([lab, val, set]) => (
                    <div key={lab}>
                      <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">{lab}</p>
                      <input type="number" inputMode="numeric" min={0} max={100} value={val}
                        onChange={(e) => set(e.target.value)} placeholder="—"
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm font-bold text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500" />
                    </div>
                  ))}
                </div>
                <input type="text" value={mockNote} onChange={(e) => setMockNote(e.target.value)} maxLength={200}
                  placeholder="One thing you noticed (optional)"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500" />
              </div>
            )}
          </div>

          </>
          )}

          {error && (
            <div className="p-3 bg-rose-950 border border-rose-700 rounded-xl text-sm text-rose-300">{error}</div>
          )}
        </div>

        <div className="sticky bottom-0 bg-zinc-950 border-t border-zinc-800 px-6 py-4">
          {/* Say what's needed BEFORE they tap, not after. The button renders
              grey until the log is valid, which reads as disabled — students
              had to tap a dead-looking button to find out what was missing. */}
          {!isValid && (
            <p className={cn('mb-2 rounded-xl px-3 py-2 text-xs',
              blockedHint ? 'border border-amber-700/40 bg-amber-950/40 text-amber-300' : 'text-zinc-500')}>
              {blockedHint ?? missingHint()}
            </p>
          )}
          <button onClick={handleSubmit} disabled={isSubmitting}
            className={cn('w-full py-4 rounded-2xl font-bold text-base transition-all flex items-center justify-center gap-2',
              isValid && !isSubmitting ? 'bg-orange-500 text-white hover:bg-orange-400 active:scale-[0.98] shadow-lg shadow-orange-500/20' : 'bg-zinc-800 text-zinc-400')}>
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSubmitting ? 'Saving…' : mockTaken ? "Update topics + mock" : "Update topics studied today"}
          </button>
        </div>
      </div>
    </div>
  );
}
