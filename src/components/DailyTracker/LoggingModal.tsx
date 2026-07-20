'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { track } from '@/lib/journey';
import { EmotionalChips } from './EmotionalChips';

// Today's plan tasks, pulled into the log so "what did you cover" IS the plan —
// one place to fill, and ticking a topic here completes it in the plan too.
interface PlanTask { id: string; section: string; topic: string | null; label: string; target: string | null; }

interface LoggingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: LoggingData) => Promise<{ mockSelected: boolean }>;
  isSubmitting?: boolean;
}

export interface LoggingData {
  hours: number;
  sections: string[];
  energy: string;
  notes?: string;
  emotional_chips?: string[];
  // Plan tasks to complete, with how far they got: 'green' = fully done,
  // 'blue' = half done (advances coverage less). Absent confidence = uncover
  // a previously-done task.
  completedTasks?: { id: string; confidence?: 'green' | 'blue' }[];
}

const HOURS_OPTIONS = [0, 2, 4, 6, 8, 10];
// 'Mock' is an explicit Yes/No question; we still fold 'Mock' into `sections`
// on submit so the server (mock_taken = sections.includes('Mock')) and the
// debrief flow are unchanged. The study sections themselves are derived from
// the plan topics the student ticks — PLUS the off-plan chips below.
//
// Off-plan escape hatch (20 July zero-log fix): a day-1 student — or anyone
// who studied their coaching's material instead of today's app plan — had NO
// honest way to submit: the button silently stayed grey unless they ticked a
// plan topic or claimed a mock. These chips restore the pre-15-July free
// selection as a fallback path, without weakening the plan integration for
// students who did follow the plan.
const OFF_PLAN_SECTIONS = ['VARC', 'DILR', 'QA', 'Revision'];
const ENERGY_OPTIONS = [
  { emoji: '🙏', label: 'Drained', value: '🙏' },
  { emoji: '💪', label: 'Solid', value: '💪' },
  { emoji: '🔥', label: 'Sharp', value: '🔥' },
];

export function LoggingModal({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting = false,
}: LoggingModalProps) {
  const [hours, setHours] = useState<number | null>(null);
  const [mockTaken, setMockTaken] = useState<boolean | null>(null);
  const [energy, setEnergy] = useState<string | null>(null);
  const [emotionalChips, setEmotionalChips] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [blockedHint, setBlockedHint] = useState<string | null>(null);
  const [planTasks, setPlanTasks] = useState<PlanTask[]>([]);
  const [taskChoice, setTaskChoice] = useState<Map<string, 'half' | 'full'>>(new Map());
  const [initialDoneIds, setInitialDoneIds] = useState<Set<string>>(new Set());
  const [offSections, setOffSections] = useState<string[]>([]);

  // Telemetry (20 July): the zero-log incident was invisible because the modal
  // emitted nothing — we couldn't tell "never opened" from "opened and gave up".
  useEffect(() => {
    if (isOpen) track('log_open');
  }, [isOpen]);

  // Pull today's plan when the log opens — its topics become the "what did you
  // cover" list, pre-ticked with anything already marked done.
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
        // Already-done topics default to "fully done".
        setTaskChoice(new Map([...done].map((id) => [id, 'full' as const])));
      } catch { /* best effort — plan just won't prefill */ }
    })();
    return () => { cancelled = true; };
  }, [isOpen]);

  // Tap Half/Full to set how far you got; tap the same one again to clear it.
  const setChoice = (id: string, choice: 'half' | 'full') => setTaskChoice((prev) => {
    const n = new Map(prev);
    if (n.get(id) === choice) n.delete(id); else n.set(id, choice);
    return n;
  });

  // Must answer the three core questions; the "what did you study" evidence can
  // come from a mock, a ticked plan topic, an off-plan section chip — or none
  // at all when hours is 0 (an honest "didn't study today" log).
  const isValid =
    hours !== null && energy !== null && mockTaken !== null &&
    (mockTaken === true || taskChoice.size > 0 || offSections.length > 0 || hours === 0);

  // Says exactly what's missing — replaces the silently-grey button that made
  // students give up without knowing why (the 19-20 July zero-log incident).
  const missingHint = (): string | null => {
    const missing: string[] = [];
    if (hours === null) missing.push('hours studied');
    if (mockTaken === null) missing.push('the mock question');
    if (energy === null) missing.push('energy level');
    if (missing.length === 0 && !(mockTaken === true || taskChoice.size > 0 || offSections.length > 0 || hours === 0)) {
      return 'Mark how far you got on a plan topic — or tap a section under "Studied something else?"';
    }
    return missing.length > 0 ? `Still needed: ${missing.join(', ')}.` : null;
  };

  const handleSubmit = async () => {
    if (!isValid) {
      const hint = missingHint();
      setBlockedHint(hint);
      track('log_blocked', { hint, hasPlanTasks: planTasks.length > 0 });
      return;
    }
    setBlockedHint(null);
    // Haptic confirmation on submit — feels native on mobile
    navigator.vibrate?.(50);
    try {
      setError(null);
      // Sections are DERIVED from the plan topics the student ticked, merged
      // with any off-plan chips (plus the mock answer folded in).
      const coveredTasks = planTasks.filter((t) => taskChoice.has(t.id));
      const derived = [...new Set([
        ...coveredTasks.map((t) => (t.section === 'General' ? 'Revision' : t.section)),
        ...offSections,
      ])];
      const finalSections = mockTaken ? [...derived.filter((s) => s !== 'Mock'), 'Mock'] : derived;
      // Send only tasks whose state CHANGED (complete-task toggles): newly
      // covered → complete with confidence (full=green, half=blue); a
      // previously-done task now cleared → uncover (no confidence).
      const completedTasks: { id: string; confidence?: 'green' | 'blue' }[] = [];
      for (const t of planTasks) {
        const choice = taskChoice.get(t.id);
        const wasDone = initialDoneIds.has(t.id);
        if (choice && !wasDone) completedTasks.push({ id: t.id, confidence: choice === 'full' ? 'green' : 'blue' });
        else if (!choice && wasDone) completedTasks.push({ id: t.id });
      }
      const result = await onSubmit({
        hours,
        sections: finalSections,
        energy,
        notes: notes.trim() || undefined,
        emotional_chips: emotionalChips.length > 0 ? emotionalChips : undefined,
        completedTasks,
      });
      // Reset form
      setHours(null);
      setTaskChoice(new Map());
      setInitialDoneIds(new Set());
      setOffSections([]);
      setMockTaken(null);
      setEnergy(null);
      setEmotionalChips([]);
      setNotes('');
      if (!result.mockSelected) onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to log. Try again.';
      track('log_error', { message: msg });
      setError(msg);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 flex items-end sm:items-center sm:justify-center">
      <div
        className={cn(
          'w-full max-w-md bg-zinc-950 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-zinc-800',
          'max-h-[92vh] overflow-y-auto flex flex-col'
        )}
      >
        {/* Header */}
        <div className="sticky top-0 bg-zinc-950 border-b border-zinc-800 px-6 py-5 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Log Today</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Day ends at 3 AM — late nights count</p>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-zinc-500 hover:text-zinc-300 transition disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 px-6 py-5 space-y-7">

          {/* Hours */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-3">
              Hours studied
            </label>
            <div className="grid grid-cols-6 gap-1.5">
              {HOURS_OPTIONS.map((h) => (
                <button
                  key={h}
                  onClick={() => setHours(h)}
                  className={cn(
                    'py-3 rounded-xl font-bold text-sm transition-all active:scale-95',
                    hours === h
                      ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30'
                      : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  )}
                >
                  {h === 10 ? '10+' : `${h}`}
                </button>
              ))}
            </div>
            {hours === 0 && (
              <p className="text-xs text-amber-400/90 mt-2">
                0-hour logs keep your record honest — they don&apos;t extend your study streak.
              </p>
            )}
          </div>

          {/* Mock test — explicit, unmissable Yes/No (drives the debrief redirect) */}
          <div className="rounded-2xl border border-teal-700/40 bg-teal-950/30 p-4">
            <label className="block text-sm font-bold text-white mb-1">
              Did you take a mock test today?
            </label>
            <p className="text-xs text-zinc-400 mb-3">
              Your mock scores drive your analysis and your buddy&apos;s plan — log every single one.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMockTaken(false)}
                className={cn(
                  'py-3 rounded-xl font-semibold text-sm transition-all active:scale-95',
                  mockTaken === false
                    ? 'bg-zinc-700 text-white ring-2 ring-zinc-500'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                )}
              >
                No, not today
              </button>
              <button
                type="button"
                onClick={() => setMockTaken(true)}
                className={cn(
                  'py-3 rounded-xl font-semibold text-sm transition-all active:scale-95',
                  mockTaken === true
                    ? 'bg-teal-500 text-white shadow-lg shadow-teal-500/30'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                )}
              >
                Yes, I gave a mock
              </button>
            </div>
            {mockTaken === true && (
              <p className="text-xs text-teal-400 mt-2 font-medium">
                ✓ Next you&apos;ll log your mock scores — VARC / DILR / QA + percentile.
              </p>
            )}
          </div>

          {/* Today's plan — mark how far you got on each topic. This IS the
              study plan; your choice marks the task done + advances coverage
              everywhere. */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-3">
              Today&apos;s plan — how far did you get?
            </label>
            {planTasks.length === 0 ? (
              <p className="text-xs text-zinc-500">No plan topics for today — just pick what you studied below{mockTaken ? ', or a mock alone is enough' : ''}.</p>
            ) : (
              <div className="space-y-2">
                {planTasks.map((t) => {
                  const choice = taskChoice.get(t.id);
                  return (
                    <div key={t.id} className="rounded-xl bg-zinc-800 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{t.target || t.label}</span>
                        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-zinc-400">{t.section}</span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setChoice(t.id, 'half')}
                          className={cn('rounded-lg py-1.5 text-xs font-bold transition-colors', choice === 'half' ? 'bg-amber-500 text-white' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600')}
                        >
                          Half done
                        </button>
                        <button
                          onClick={() => setChoice(t.id, 'full')}
                          className={cn('flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-bold transition-colors', choice === 'full' ? 'bg-emerald-500 text-white' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600')}
                        >
                          {choice === 'full' && <Check className="h-3 w-3" strokeWidth={3} />} Fully done
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Off-plan sections — the honest path for study that wasn't on
              today's app plan (coaching class, own material, day-1 students).
              Without this the submit button was unreachable for them. */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-3">
              Studied something else?
            </label>
            <div className="grid grid-cols-4 gap-2">
              {OFF_PLAN_SECTIONS.map((s) => {
                const on = offSections.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setOffSections((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))}
                    className={cn(
                      'py-2.5 rounded-xl font-semibold text-xs transition-all active:scale-95',
                      on ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                    )}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-zinc-600 mt-1.5">Coaching class, own material — it all counts.</p>
          </div>

          {/* Energy */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-3">
              Energy level
            </label>
            <div className="grid grid-cols-3 gap-2">
              {ENERGY_OPTIONS.map((e) => (
                <button
                  key={e.value}
                  onClick={() => setEnergy(e.value)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 py-4 rounded-2xl transition-all active:scale-95',
                    energy === e.value
                      ? 'bg-zinc-700 ring-2 ring-orange-500 ring-offset-2 ring-offset-zinc-950'
                      : 'bg-zinc-800 hover:bg-zinc-700'
                  )}
                >
                  <span className="text-3xl">{e.emoji}</span>
                  <span className="text-xs font-semibold text-zinc-300">{e.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Emotional chips */}
          <EmotionalChips selected={emotionalChips} onChange={setEmotionalChips} />

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2">
              Notes <span className="normal-case font-normal text-zinc-600">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any wins, blockers, or thoughts..."
              maxLength={200}
              rows={2}
              className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none"
            />
            <p className="text-xs text-zinc-600 mt-1 text-right">{notes.length}/200</p>
          </div>

          {error && (
            <div className="p-3 bg-rose-950 border border-rose-700 rounded-xl text-sm text-rose-300">
              {error}
            </div>
          )}
        </div>

        {/* Footer — the button stays TAPPABLE even when the form is incomplete:
            tapping it explains what's missing instead of sitting silently grey
            (the silent grey button is how the 19-20 July cohort got stuck). */}
        <div className="sticky bottom-0 bg-zinc-950 border-t border-zinc-800 px-6 py-4">
          {blockedHint && !isValid && (
            <p className="mb-2 rounded-xl border border-amber-700/40 bg-amber-950/40 px-3 py-2 text-xs text-amber-300">{blockedHint}</p>
          )}
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={cn(
              'w-full py-4 rounded-2xl font-bold text-base transition-all flex items-center justify-center gap-2',
              isValid && !isSubmitting
                ? 'bg-orange-500 text-white hover:bg-orange-400 active:scale-[0.98] shadow-lg shadow-orange-500/20'
                : 'bg-zinc-800 text-zinc-400'
            )}
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSubmitting ? 'Logging…' : mockTaken ? 'Log & Debrief →' : 'Log Today'}
          </button>
          <p className="text-[11px] text-zinc-600 text-center mt-2">15 seconds. The app answers back.</p>
        </div>
      </div>
    </div>
  );
}
