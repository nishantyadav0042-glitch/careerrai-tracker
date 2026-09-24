'use client';

import { useEffect, useRef, useState } from 'react';
import { track } from '@/lib/journey';
import { TaskResource, type TaskResource as TaskResourceData } from '@/components/task-resource';
import {
  TOUR_DONE_EVENT, NOTIF_ASK_SETTLED_EVENT, INSIGHT_DONE_EVENT,
  tourDone, tourVisible, notifAskVisible, insightVisible, logModalOpen, setLogModalOpen,
} from '@/lib/first-run-events';
import {
  STUDY_SLOTS, COULDNT_REASONS, FIRST_TASK_FLOW_KEY,
  formatMinutes, promiseDue, readPromise, writePromise, slotLabel,
  type StudySlot, type CouldntReason, type StudyPromise,
} from '@/lib/first-task';

// ── The first task, done on day one (24 Sep) ─────────────────────────────────
//
// Rules in lib/first-task.ts. Written for a student who arrived knowing
// nothing: no "log", no "streak", no "tour" in the copy. What they are told is
// what happens: you study from your own material or one free video, then you
// tap here so tomorrow's plan knows.
//
// Replaces the old first-log prompt, which opened the log sheet in the first
// session, before the student could have studied anything (198 students got it
// in the 30 days to 24 Sep).
//
// Marking goes through the Home card's own toggleTask (passed in as onMark),
// the same write a tap on the task makes. There is no second logging path.

export interface FirstTask {
  id: string;
  title: string;
  estMinutes: number;
  topic: string | null;
  resource?: TaskResourceData | null;
  secondary?: TaskResourceData | null;
}

type Stage = 'offer' | 'studying' | 'result' | 'couldnt' | 'when' | 'done';

const SETTLE_MS = 700;

// Module-level clock reader, the same pattern TodaysRoutineCard uses: the
// React compiler reads any Date.now() in a component body as render-time
// impurity, even when only an event handler calls it.
const clockMs = () => Date.now();

function isStandalone(): boolean {
  try {
    const nav = navigator as Navigator & { standalone?: boolean };
    return window.matchMedia?.('(display-mode: standalone)').matches === true || nav.standalone === true;
  } catch { return false; }
}

export function FirstTaskFlow({
  enabled, task, onMark,
}: {
  /** Never logged, onboarding finished. The Home page decides. */
  enabled: boolean;
  task: FirstTask | null;
  onMark: (portion: 'full' | 'half') => Promise<boolean>;
}) {
  const [stage, setStage] = useState<Stage | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneLine, setDoneLine] = useState('');
  const startedAt = useRef<number | null>(null);
  const shown = useRef(false);
  // The parent rebuilds `task` on every render; the open-effect keys on its
  // id and reads the rest from here, so a re-render never resets the settle
  // timer.
  const taskRef = useRef(task);
  useEffect(() => { taskRef.current = task; });
  const taskId = task?.id ?? null;
  const wake = useRef<{ release: () => Promise<void> } | null>(null);

  // Open once the screen is clear: after the tour where there is one (the
  // tour only runs in the installed app), never over the notification ask,
  // the first insight, or a sheet the student already has open.
  useEffect(() => {
    if (!enabled || !taskId) return;
    try { if (localStorage.getItem(FIRST_TASK_FLOW_KEY)) return; } catch { return; }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const attempt = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (shown.current) return;
        if (isStandalone() && !tourDone()) return;
        if (tourVisible() || notifAskVisible() || insightVisible() || logModalOpen()) return;
        const t = taskRef.current;
        if (!t) return;
        shown.current = true;
        setLogModalOpen(true); // the buddy nudge and coverage review wait for this
        setStage('offer');
        track('first_task_offered', { minutes: t.estMinutes, hasVideo: !!t.resource });
      }, SETTLE_MS);
    };
    attempt();
    window.addEventListener(TOUR_DONE_EVENT, attempt);
    window.addEventListener(NOTIF_ASK_SETTLED_EVENT, attempt);
    window.addEventListener(INSIGHT_DONE_EVENT, attempt);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener(TOUR_DONE_EVENT, attempt);
      window.removeEventListener(NOTIF_ASK_SETTLED_EVENT, attempt);
      window.removeEventListener(INSIGHT_DONE_EVENT, attempt);
    };
  }, [enabled, taskId]);

  // The study clock counts UP. A countdown turns a first try into a test.
  useEffect(() => {
    if (stage !== 'studying') return;
    const t = setInterval(() => {
      if (startedAt.current != null) setElapsed(Math.floor((clockMs() - startedAt.current) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [stage]);

  useEffect(() => () => { setLogModalOpen(false); void wake.current?.release().catch(() => {}); }, []);

  if (!stage || !task) return null;

  const decided = () => { try { localStorage.setItem(FIRST_TASK_FLOW_KEY, '1'); } catch { /* ignore */ } };
  const close = () => {
    setStage(null);
    setLogModalOpen(false);
    void wake.current?.release().catch(() => {});
    wake.current = null;
  };
  const seconds = () => (startedAt.current != null ? Math.round((clockMs() - startedAt.current) / 1000) : null);

  const start = async () => {
    decided();
    startedAt.current = clockMs();
    setElapsed(0);
    setStage('studying');
    track('first_task_started', {});
    try {
      const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
      wake.current = (await nav.wakeLock?.request('screen')) ?? null;
    } catch { /* optional: the screen may sleep */ }
  };

  const mark = async (portion: 'full' | 'half') => {
    if (saving) return;
    setSaving(true);
    setError(null);
    const ok = await onMark(portion);
    setSaving(false);
    if (!ok) { setError('That didn’t save. Check your connection and tap again.'); return; }
    track('first_task_outcome', { outcome: portion, seconds: seconds() });
    setDoneLine(portion === 'full'
      ? 'Marked as finished. Tomorrow’s plan builds on it.'
      : 'Marked as halfway. Tomorrow’s plan picks it up from there.');
    setStage('done');
  };

  const couldnt = (reason: CouldntReason) => {
    track('first_task_outcome', { outcome: 'couldnt', reason, seconds: seconds() });
    setStage('when');
  };

  const promise = (slot: StudySlot | null) => {
    decided();
    if (slot) {
      writePromise(slot, new Date());
      track('first_task_later', { slot });
      setDoneLine(`Got it: ${slotLabel(slot).toLowerCase()}. Your task will be waiting right here on Home.`);
    } else {
      track('first_task_later', { slot: null });
      setDoneLine('Okay. Your plan will be here whenever you’re ready.');
    }
    setStage('done');
  };

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  return (
    <div className="fixed inset-0 z-[96] flex items-end justify-center bg-slate-900/70 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="Your first task">
      <div className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-4 shadow-2xl">
        {stage === 'offer' && (
          <>
            <p className="text-[10px] font-bold uppercase tracking-widest text-orange-500">Your first task · {formatMinutes(task.estMinutes)}</p>
            <h3 className="text-base font-bold leading-snug text-stone-900">{task.title}</h3>
            <p className="text-sm leading-relaxed text-stone-600">
              CareerRai doesn’t teach. It tells you what to study. Use your own book or coaching notes
              {task.resource ? ', or start with this free video:' : '.'}
            </p>
            {task.resource && (
              <TaskResource resource={task.resource} secondary={task.secondary ?? null} topic={task.topic} taskId={task.id} />
            )}
            <div className="grid gap-2 pt-1">
              <button type="button" onClick={() => void start()} className="rounded-xl bg-stone-900 py-3 text-sm font-bold text-white active:scale-[0.99]">Start now</button>
              <button type="button" onClick={() => { decided(); setStage('when'); track('first_task_not_now', {}); }} className="rounded-xl bg-stone-100 py-3 text-sm font-semibold text-stone-700 active:scale-[0.99]">Not now, I’ll study later</button>
            </div>
          </>
        )}

        {stage === 'studying' && (
          <>
            <p className="text-[10px] font-bold uppercase tracking-widest text-orange-500">Studying</p>
            <h3 className="text-base font-bold leading-snug text-stone-900">{task.title}</h3>
            <p className="text-center text-4xl font-extrabold tabular-nums text-stone-900" aria-live="off">{mm}:{ss}</p>
            <p className="text-center text-xs text-stone-500">Planned: {formatMinutes(task.estMinutes)}. Stop whenever you need to.</p>
            {task.resource && (
              <TaskResource resource={task.resource} secondary={task.secondary ?? null} topic={task.topic} taskId={task.id} />
            )}
            <button type="button" onClick={() => setStage('result')} className="w-full rounded-xl bg-stone-900 py-3 text-sm font-bold text-white active:scale-[0.99]">I’ve stopped studying</button>
          </>
        )}

        {stage === 'result' && (
          <>
            <h3 className="text-base font-bold text-stone-900">How did it go?</h3>
            <p className="text-sm text-stone-600">Tap one. This is how CareerRai knows what you did, so tomorrow’s plan fits.</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={saving} onClick={() => void mark('half')} className="rounded-xl border border-amber-300 bg-amber-50 py-3 text-sm font-bold text-amber-800 disabled:opacity-50">Got halfway</button>
              <button type="button" disabled={saving} onClick={() => void mark('full')} className="rounded-xl bg-stone-900 py-3 text-sm font-bold text-white disabled:opacity-50">Finished it</button>
            </div>
            <button type="button" disabled={saving} onClick={() => setStage('couldnt')} className="w-full rounded-xl bg-stone-100 py-2.5 text-sm font-semibold text-stone-700 disabled:opacity-50">Couldn’t do it</button>
            {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
          </>
        )}

        {stage === 'couldnt' && (
          <>
            <h3 className="text-base font-bold text-stone-900">What got in the way?</h3>
            <p className="text-sm text-stone-600">That’s useful to know. It helps us fix your plan.</p>
            <div className="grid gap-2">
              {COULDNT_REASONS.map((r) => (
                <button key={r.reason} type="button" onClick={() => couldnt(r.reason)} className="rounded-xl border border-stone-200 bg-white py-2.5 text-sm font-semibold text-stone-800 active:scale-[0.99]">{r.label}</button>
              ))}
            </div>
          </>
        )}

        {stage === 'when' && (
          <>
            <h3 className="text-base font-bold text-stone-900">When will you study today?</h3>
            <p className="text-sm text-stone-600">Your first task will be waiting on Home. When you open the app after that time, one tap marks it.</p>
            <div className="grid grid-cols-2 gap-2">
              {STUDY_SLOTS.map((s) => (
                <button key={s.slot} type="button" onClick={() => promise(s.slot)} className="rounded-xl border border-stone-200 bg-white py-2.5 text-sm font-bold text-stone-800 active:scale-[0.99]">{s.label}</button>
              ))}
            </div>
            <button type="button" onClick={() => promise(null)} className="w-full py-1 text-xs font-medium text-stone-400">Not today</button>
          </>
        )}

        {stage === 'done' && (
          <>
            <p className="text-sm font-semibold leading-relaxed text-stone-800">{doneLine}</p>
            <button type="button" onClick={close} className="w-full rounded-xl bg-stone-900 py-3 text-sm font-bold text-white">Okay</button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The promise, kept. After the time the student chose, on the same study day,
 * the top of Home asks once per open. Not in the session the promise was made
 * (they have just said "later"), and gone once the task is marked.
 */
export function FirstTaskReminder({
  task, onMark,
}: {
  task: FirstTask | null;
  onMark: (portion: 'full' | 'half') => Promise<boolean>;
}) {
  const [p, setP] = useState<StudyPromise | null>(null);
  const [hidden, setHidden] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Decided once per open, from storage and the clock, never during render.
  // A promise made in this same session (under a minute old) waits for the
  // next open: the student has just said "later".
  useEffect(() => {
    const promise = readPromise();
    const now = new Date();
    const isDue = !!promise && promise.at < now.getTime() - 60_000 && promiseDue(promise, now);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- storage is client-only; read once after mount
    setP(isDue ? promise : null);
  }, []);

  const showing = !!p && !!task && !hidden;
  useEffect(() => {
    if (showing && p) track('first_task_reminder_shown', { slot: p.slot });
  }, [showing, p]);

  if (!showing || !p || !task) return null;

  const mark = async (portion: 'full' | 'half') => {
    if (saving) return;
    setSaving(true);
    setError(null);
    const ok = await onMark(portion);
    setSaving(false);
    if (!ok) { setError('That didn’t save. Tap again.'); return; }
    track('first_task_outcome', { outcome: portion, via: 'reminder' });
    setHidden(true);
  };

  return (
    <div className="mb-2 space-y-2 rounded-xl bg-stone-900 p-3 text-white">
      <p className="text-[12.5px] font-semibold">You said {slotLabel(p.slot).toLowerCase()}. Studied your first task?</p>
      <p className="text-[12px] text-white/70">{task.title}</p>
      <div className="flex gap-2">
        <button type="button" disabled={saving} onClick={() => void mark('half')} className="flex-1 rounded-lg bg-white/15 py-2 text-[12px] font-bold disabled:opacity-50">Got halfway</button>
        <button type="button" disabled={saving} onClick={() => void mark('full')} className="flex-1 rounded-lg bg-white py-2 text-[12px] font-bold text-stone-900 disabled:opacity-50">Finished it</button>
        <button type="button" onClick={() => { setHidden(true); track('first_task_reminder_dismissed', { slot: p.slot }); }} className="px-2 text-[12px] font-medium text-white/60">Not yet</button>
      </div>
      {error && <p className="text-[11.5px] font-semibold text-rose-300">{error}</p>}
    </div>
  );
}
