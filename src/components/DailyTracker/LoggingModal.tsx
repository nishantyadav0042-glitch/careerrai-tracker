'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Loader2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { track } from '@/lib/journey';
import { setLogModalOpen } from '@/lib/first-run-events';
import type { MockDebriefData } from './MockDebriefModal';
import type { DayOutcome } from '@/lib/check-in';
import { creditedHours } from '@/lib/study-credit';
import { completionRequestFor } from '@/lib/completion-portion';

// Today's plan tasks, pulled into the log so "what did you cover" IS the plan.
interface PlanTask { id: string; section: string; topic: string | null; label: string; target: string | null; }

interface LoggingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: LoggingData) => Promise<{ mockSelected: boolean }>;
  /** Opened from the "Gave a mock" entry — the mock section starts open, so a
   *  student who came here to record a mock is not asked to find it again. */
  openWithMock?: boolean;
  isSubmitting?: boolean;
}

export interface LoggingData {
  hours: number;
  sections: string[];
  energy: string; // kept for the log RPC contract; defaulted, not asked
  plan_fit?: string;        // legacy field on the API; no longer collected
  blocker_reason?: string;  // legacy field on the API; no longer collected
  confidence?: number;      // legacy; no longer collected
  // Plan tasks to complete, with how far they got: 'green' = fully done,
  // 'blue' = half done. Absent = uncover a previously-done task.
  completedTasks?: { id: string; confidence?: string }[];
  // Mock debrief captured INLINE on this same sheet (null when no mock today).
  mock?: MockDebriefData | null;
  // Derived silently from plan completion for the coach-facing signals; the
  // student is no longer asked to pick it.
  day_outcome?: DayOutcome;
}

// Founder redesign (10 Aug): make the log SIMPLE and straightforward — two
// things only. "Today's plan" (mark your topics) and "did you give a mock". No
// day-outcome buttons, no plan-felt, no off-plan picker. Not logging a day just
// means you rested — a student who logs ten days and skips one took a break,
// and we don't need a button to say so. Hours are derived from plan coverage
// (lib/study-credit), never typed.
export type { DayOutcome };

type TaskState = 'half' | 'full';

export function LoggingModal({ isOpen, onClose, onSubmit, isSubmitting = false, openWithMock }: LoggingModalProps) {
  const [planTasks, setPlanTasks] = useState<PlanTask[]>([]);
  const [taskChoice, setTaskChoice] = useState<Map<string, TaskState>>(new Map());
  const [initialPortions, setInitialPortions] = useState<Map<string, 'full' | 'half'>>(new Map());
  // The third thing: an honest rest day. It's a real log — showing up counts,
  // and the streak now counts logged days — so it never breaks a streak.
  const [rest, setRest] = useState(false);
  // The hours the day's plan was built to — derived credit is a fraction of it.
  const [generatedHours, setGeneratedHours] = useState<number>(0);
  const [mockTaken, setMockTaken] = useState<boolean | null>(null);
  // Inline mock percentiles (only when mockTaken === true)
  const [mockOverall, setMockOverall] = useState<string>('');
  const [mockVarc, setMockVarc] = useState<string>('');
  const [mockDilr, setMockDilr] = useState<string>('');
  const [mockQa, setMockQa] = useState<string>('');
  const [mockNote, setMockNote] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [blockedHint, setBlockedHint] = useState<string | null>(null);
  const openedAt = useRef<number>(0);
  const savedRef = useRef(false);

  useEffect(() => {
    setLogModalOpen(isOpen);
    if (isOpen) {
      openedAt.current = Date.now();
      savedRef.current = false;
      track('log_open');
      // Arriving from the mock entry: the answer to "did you give a mock" is
      // already known, so pre-answer it rather than making them say it twice.
      if (openWithMock) setMockTaken(true);
    }
    return () => setLogModalOpen(false);
  }, [isOpen, openWithMock]);

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
        // The day's planned hours — the ceiling that coverage is credited against.
        setGeneratedHours(Number(json?.routine?.generated_hours ?? json?.todayBudget?.hours ?? 0) || 0);
        setPlanTasks(rawTasks.map((t) => ({ id: String(t.id), section: t.section, topic: t.topic ?? null, label: String(t.label ?? ''), target: t.target ?? null })));
        // P0-2.3c — seed each task from its REAL portion.
        //
        // This used to seed every existing completion as 'full', so a task the
        // student had marked "Got halfway" opened showing "Done" — a display
        // lie — and submitting it sent nothing, because the old
        // `choice && !wasDone` gate dropped the upgrade before it left the
        // browser. The wire has carried `portion` since P0-2.1.
        const wire = (json?.completions ?? []) as { task_id: string; portion?: 'full' | 'half' }[];
        const portionById = new Map<string, 'full' | 'half'>(
          wire.map((c) => [String(c.task_id), c.portion === 'half' ? 'half' : 'full'])
        );
        const done = new Set<string>(rawTasks.filter((t) => doneIds.has(String(t.id))).map((t) => String(t.id)));
        setInitialPortions(portionById);
        setTaskChoice(new Map([...done].map((id) => [id, portionById.get(id) ?? 'full'])));
      } catch { /* best effort */ }
    })();
    return () => { cancelled = true; };
  }, [isOpen]);

  // Three-state tap: Not done (clear) / Half / Done. Marking study clears rest.
  const setChoice = (id: string, choice: TaskState | null) => { setRest(false); setTaskChoice((prev) => {
    const n = new Map(prev);
    if (choice === null) n.delete(id); else n.set(id, choice);
    return n;
  }); };

  // Toggling a rest day clears any study marks — it's one or the other.
  const toggleRest = () => setRest((r) => { const next = !r; if (next) { setTaskChoice(new Map()); setMockTaken(null); } return next; });

  // Valid the moment there's a real signal: a plan topic marked, a mock, or an
  // honest rest day. All three are a log — showing up.
  const isValid = taskChoice.size > 0 || mockTaken === true || rest;

  const missingHint = (): string =>
    'Mark how far you got on a plan topic — or tell us you gave a mock.';

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

      // An honest rest day: 0 hours, no topics, marked not-studied. Still a log,
      // so the streak (which now counts logged days) survives it.
      if (rest) {
        await onSubmit({ hours: 0, sections: [], energy: '💪', completedTasks: [], mock: null, day_outcome: 'not_studied' });
        setRest(false);
        savedRef.current = true;
        onClose();
        return;
      }

      const coveredTasks = planTasks.filter((t) => taskChoice.has(t.id));
      const derived = [...new Set(coveredTasks.map((t) => (t.section === 'General' ? 'Revision' : t.section)))];
      const finalSections = mockTaken ? [...derived.filter((s) => s !== 'Mock'), 'Mock'] : derived;

      // One authority decides what to send, shared with the server's
      // resolveTransition so the two halves of the contract cannot drift.
      const completedTasks: { id: string; confidence?: string }[] = [];
      for (const t of planTasks) {
        const req = completionRequestFor(t.id, initialPortions.get(t.id) ?? null, taskChoice.get(t.id) ?? null);
        if (req) completedTasks.push(req);
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

      // Hours DERIVED from plan coverage — completing the plan earns the plan's
      // hours, proportionally; capped at the day's plan.
      const marks = [...taskChoice.values()];
      const derivedHours = creditedHours({
        generatedHours,
        plannedTasks: planTasks.length,
        fullDone: marks.filter((m) => m === 'full').length,
        halfDone: marks.filter((m) => m === 'half').length,
        offPlanCount: 0,
      });

      // 0C.3G/J1: no longer sending a derived day_outcome here. What this
      // computed — "did the student finish everything they ticked" — is now
      // observed_day_outcome, a Fact Registry DERIVED_FACT computed server-side
      // from the SAME persisted completion rows this submission's own tick
      // fan-out just wrote, independent of what gets sent in this payload. The
      // self-reported column stays exclusively for what the student actually
      // declared: the check-in gate's tap, or the Rest toggle above.
      await onSubmit({
        hours: derivedHours,
        sections: finalSections,
        energy: '💪', // defaulted — no longer asked
        completedTasks,
        mock,
      });

      // Reset
      setTaskChoice(new Map());
      setInitialPortions(new Map());
      setRest(false);
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

  const handleClose = () => {
    if (!savedRef.current) {
      track('log_dismissed', {
        secondsOpen: openedAt.current ? Math.round((Date.now() - openedAt.current) / 1000) : null,
        planTasksOffered: planTasks.length,
        tasksMarked: taskChoice.size,
        mockAnswered: mockTaken !== null,
        wasSubmittable: isValid,
        touchedAnything: taskChoice.size > 0 || mockTaken !== null,
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
          <h2 className="text-xl font-bold text-white">Log today</h2>
          <button onClick={handleClose} disabled={isSubmitting} className="text-zinc-500 hover:text-zinc-300 transition disabled:opacity-50">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 px-6 py-5 space-y-7">

          {/* 1 — Today's plan (mark what you covered — the whole log) */}
          <div>
            {label("Today's plan")}
            {planTasks.length === 0 ? (
              <p className="text-xs text-zinc-500">No plan topics today. If you gave a mock, tell us below.</p>
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

          {/* 2 — Mock (folded in, no second screen) */}
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

          {/* 3 — Rest day (personal commitments). An honest break still counts as
              showing up — it's a log, and it keeps your streak alive. */}
          <button type="button" onClick={toggleRest}
            className={cn('w-full rounded-2xl border p-3.5 text-left transition-all active:scale-[0.99]',
              rest ? 'border-amber-500 bg-amber-500/10' : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700')}>
            <span className={cn('text-sm font-bold', rest ? 'text-amber-300' : 'text-white')}>
              {rest ? '✓ Rest day — personal commitments' : 'Rest day — personal commitments'}
            </span>
            <span className="mt-0.5 block text-[11.5px] leading-snug text-zinc-500">
              Taking today off. It still counts as showing up — your streak stays alive.
            </span>
          </button>

          {error && (
            <div className="p-3 bg-rose-950 border border-rose-700 rounded-xl text-sm text-rose-300">{error}</div>
          )}
        </div>

        <div className="sticky bottom-0 bg-zinc-950 border-t border-zinc-800 px-6 py-4">
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
            {isSubmitting ? 'Saving…' : mockTaken ? 'Save log + mock' : 'Save log'}
          </button>
        </div>
      </div>
    </div>
  );
}
