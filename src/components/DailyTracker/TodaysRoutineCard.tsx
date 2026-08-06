'use client';
 
import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { QUANT_TOPICS, VERBAL_TOPICS, LRDI_TOPICS } from '@/lib/topics-constants';
import { TopicInsights } from '@/components/topic-insights';

// For the swap-topic picker (student ask: "change today's topic from
// Geometry to Number System") — same-section alternatives only.
const SECTION_TOPICS: Record<string, string[]> = { VARC: VERBAL_TOPICS, DILR: LRDI_TOPICS, QA: QUANT_TOPICS };

type CoverageStatus = 'not_started' | 'learning' | 'practicing' | 'revising' | 'exam_ready';

interface RoutineTask {
  id: string;
  section: string;
  topic: string | null;
  label: string;
  target?: string | null; // executable goal — older stored routines predate it
  estMinutes: number;
  reason: string | null;
  isImplementationIntention?: boolean;
  // Looked up fresh per request, not stored on the frozen routine row — see
  // /api/routine/today. Absent entirely on routines generated before this shipped.
  coverageStatus?: CoverageStatus | null;
  lastTouchedDaysAgo?: number | null;
  timesPracticed?: number;
}

// "Last done 6 days ago" / "First time" / "3rd revision" — three words, not
// a sentence. Memory made visible without making it emotional.
function memoryTag(task: RoutineTask): string | null {
  if (!task.topic) return null;
  if (task.lastTouchedDaysAgo == null) return 'First time';
  if (task.lastTouchedDaysAgo === 0) return 'Practiced today';
  const times = task.timesPracticed ?? 0;
  const ordinal = times === 1 ? '1st' : times === 2 ? '2nd' : times === 3 ? '3rd' : `${times}th`;
  return times > 1 ? `${ordinal} revision · ${task.lastTouchedDaysAgo}d ago` : `Last done ${task.lastTouchedDaysAgo}d ago`;
}

// Plain self-assessment words, not slang. Four points, not three, so
// "real progress but not solid yet" has its own answer instead of getting
// forced into either "Confident" or "Not sure." Maps directly to
// applyConfidenceSignal (topic-selector.ts): green advances fully, blue
// advances but caps below revision-ready, yellow holds steady, red regresses.
type ConfidenceSignal = 'green' | 'blue' | 'yellow' | 'red';
const CONFIDENCE_OPTIONS: { value: ConfidenceSignal; emoji: string; label: string }[] = [
  { value: 'green', emoji: '🟢', label: 'Confident' },
  { value: 'blue', emoji: '🔵', label: 'Getting there' },
  { value: 'yellow', emoji: '🟡', label: 'Not sure' },
  { value: 'red', emoji: '🔴', label: 'Struggling' },
];

interface RoutineResponse {
  routine: { phase: string; tasks: RoutineTask[]; est_minutes: number; calibration?: string | null };
  completions: { task_id: string; is_emergency: boolean }[];
  currentStreak: number;
  isCatchUp: boolean;
  yesterday?: { total: number; done: number } | null;
  /** The specific, TRUE reason today looks the way it does. Null = no
   *  specific claim is true, fall back to the generic narration. */
  because?: { line: string; kind: string } | null;
  /** The hours today's plan was built to, and why it is that number. */
  todayBudget?: {
    hours: number;
    claimedHours: number | null;
    trimmed: boolean;
    reason: string | null;
  } | null;
}

// Time budget filters today's list — same tasks, never invented ones.
// 'planned' = the full plan (default; most days nobody changes it). 30 is
// not just "a shorter list" — completing just the top task under this
// budget is tagged is_emergency server-side (complete-task/route.ts) and
// counts as a full streak-preserving day. Only two options because that's
// the only real fork: a normal day, or a crisis day. 1h/2h were arbitrary
// in-between trims with no distinct meaning and no visible effect most
// days, just four buttons competing with the actual task below them.
type TimeBudget = 30 | 'planned';

// Fallback for routines generated before targets existed: the plain label,
// never an invented count — the old minutes/3 formula here claimed "15
// Reading Comprehension questions" for a topic the engine measures in
// passages. The server supplies task.target for every routine generated
// since targets shipped; only pre-target legacy rows hit the fallback.
function taskTitle(task: RoutineTask): string {
  return task.target ?? task.label;
}

// 30-second module-level cache for GET /api/routine/today — the single
// heaviest student API. A student bouncing Home → Log → Home re-renders
// this card within seconds and used to pay the full backend round-trip
// each time. Busted on every task completion so the card can never show
// pre-completion state after an action; anything past 30s refetches.
let routineTodayCache: { at: number; json: unknown } | null = null;
const ROUTINE_CACHE_MS = 30_000;

export function TodaysRoutineCard() {
  const [data, setData] = useState<RoutineResponse | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [budget] = useState<TimeBudget>('planned');
  const [fullyDone, setFullyDone] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [swapTaskId, setSwapTaskId] = useState<string | null>(null);
  const [swapBusy, setSwapBusy] = useState(false);
  const [swapNote, setSwapNote] = useState<string | null>(null);
  const [calibrated, setCalibrated] = useState(false);
  const [calibrationBusy, setCalibrationBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // One-tap daily calibration — the highest-ROI signal we collect. Fire and
  // thank; the engine collects first and tunes later.
  async function calibrate(verdict: 'too_easy' | 'just_right' | 'too_much') {
    if (calibrationBusy) return;
    setCalibrationBusy(true);
    try {
      const res = await fetch('/api/routine/calibrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verdict }),
      });
      if (res.ok) { setCalibrated(true); routineTodayCache = null; }
    } finally {
      setCalibrationBusy(false);
    }
  }
  const [confidenceTaps, setConfidenceTaps] = useState<{ topic: string; confidence: ConfidenceSignal }[]>([]);
  // Reading the routine isn't the same as committing to it — viewedAt marks
  // when a real (non-empty, non-setup) routine first appeared on screen,
  // and the first task tap reports elapsed time against it. hasReportedStart
  // guards against double-firing if the student taps more than one task.
  const viewedAt = useRef<number | null>(null);
  const startedAt = useRef<number | null>(null);
  const hasReportedStart = useRef(false);
  const hasReportedComplete = useRef(false);

  const load = useCallback(async () => {
    try {
      let json: RoutineResponse;
      if (routineTodayCache && Date.now() - routineTodayCache.at < ROUTINE_CACHE_MS) {
        json = routineTodayCache.json as RoutineResponse;
      } else {
        const res = await fetch('/api/routine/today');
        if (!res.ok) {
          // Expired session token: the page refreshed its session on load but
          // this background fetch carried the stale token -> silent 401 that
          // Retry could never fix (Vedprakash's blank card). One full reload
          // runs the middleware token refresh; guarded so it can't loop.
          const body = await res.json().catch(() => ({}));
          setLoadError(typeof body?.error === 'string' ? `${body.error} (${res.status})` : `Server responded ${res.status}`);
          if (res.status === 401 && !sessionStorage.getItem('cr_rt_reloaded')) {
            sessionStorage.setItem('cr_rt_reloaded', '1');
            window.location.reload();
          }
          return;
        }
        sessionStorage.removeItem('cr_rt_reloaded');
        json = (await res.json()) as RoutineResponse;
        routineTodayCache = { at: Date.now(), json };
      }
      setData(json);
      setCompletedIds(new Set(json.completions.map((c) => c.task_id)));
      if (viewedAt.current == null) {
        viewedAt.current = Date.now();
        fetch('/api/routine/engagement', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: 'viewed' }),
        }).catch(() => {});
      }
    } finally {
      setLoading(false);
    }
  }, []);

  function reportStart() {
    if (hasReportedStart.current || viewedAt.current == null) return;
    hasReportedStart.current = true;
    startedAt.current = Date.now();
    const seconds = Math.round((startedAt.current - viewedAt.current) / 1000);
    fetch('/api/routine/engagement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'started', seconds_to_start: seconds }),
    }).catch(() => {});
  }

  function reportComplete() {
    if (hasReportedComplete.current) return;
    hasReportedComplete.current = true;
    const seconds = startedAt.current != null ? Math.round((Date.now() - startedAt.current) / 1000) : null;
    fetch('/api/routine/engagement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'completed', seconds_since_started: seconds }),
    }).catch(() => {});
  }

  useEffect(() => { load(); }, [load]);

  // When the daily log completes topics, re-pull so this card shows them done.
  useEffect(() => {
    const onUpdated = () => { routineTodayCache = null; load(); };
    window.addEventListener('cr-routine-updated', onUpdated);
    return () => window.removeEventListener('cr-routine-updated', onUpdated);
  }, [load]);

  async function toggleTask(task: RoutineTask, confidence?: ConfidenceSignal) {
    if (busyTaskId) return;
    setBusyTaskId(task.id);
    try {
      const res = await fetch('/api/routine/complete-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: task.id, is_emergency: budget === 30, ...(confidence ? { confidence } : {}) }),
      });
      if (!res.ok) return;
      // Server state changed — the 30s GET cache must never serve
      // pre-completion data.
      routineTodayCache = null;
      const json = (await res.json()) as { completedTaskIds: string[]; fullyDone: boolean };
      setCompletedIds(new Set(json.completedTaskIds));
      setExpandedTaskId(null);
      if (confidence && task.topic) setConfidenceTaps((prev) => [...prev, { topic: task.topic!, confidence }]);
      if (json.fullyDone) { setFullyDone(true); reportComplete(); }
    } finally {
      setBusyTaskId(null);
    }
  }

  // Swap one of today's topics for a same-section alternative — the plan's
  // section balance stays; which topic within it is the student's call.
  async function swapTopic(task: RoutineTask, topic: string) {
    if (swapBusy) return;
    setSwapBusy(true);
    try {
      const res = await fetch('/api/routine/swap-topic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id, topic }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { if (json?.error) alert(json.error); return; }
      routineTodayCache = null;
      setData((prev) => (prev ? { ...prev, routine: { ...prev.routine, tasks: json.tasks as RoutineTask[] } } : prev));
      setSwapTaskId(null);
      // "Geometry will automatically come back tomorrow" — the never-delete,
      // always-postpone rule, said out loud so the swap feels safe.
      if (json.note) {
        setSwapNote(json.note as string);
        setTimeout(() => setSwapNote(null), 5000);
      }
    } finally {
      setSwapBusy(false);
    }
  }

  function handleTaskTap(task: RoutineTask, done: boolean) {
    if (!done) reportStart();
    if (done) { toggleTask(task); return; }
    if (task.topic) { setExpandedTaskId((cur) => (cur === task.id ? null : task.id)); return; }
    toggleTask(task);
  }

  if (loading) {
    return (
      <Card className="p-5 animate-pulse">
        <div className="h-4 w-32 bg-stone-200 rounded mb-3" />
        <div className="h-16 bg-stone-100 rounded" />
      </Card>
    );
  }
  if (!data) {
    // NEVER vanish silently (real student report: "unable to view today's
    // task" with a blank space) — show the failure + a retry.
    return (
      <Card className="p-5 text-center">
        <p className="text-sm font-semibold text-stone-800">Today&apos;s plan couldn&apos;t load</p>
        <p className="mt-1 text-xs text-stone-500">{loadError ?? 'Check your connection — your plan is safe.'}</p>
        <button
          type="button"
          onClick={() => { routineTodayCache = null; setLoading(true); load(); }}
          className="mt-3 rounded-xl bg-stone-900 px-4 py-2 text-xs font-semibold text-white active:scale-95"
        >
          Retry
        </button>
      </Card>
    );
  }

  const { routine } = data;
  // Budget filter: keep tasks (in priority order) while they fit; always ≥1.
  const tasks = budget === 'planned'
    ? routine.tasks
    : routine.tasks.reduce<{ list: RoutineTask[]; used: number }>((acc, t) => {
        if (acc.list.length === 0 || acc.used + t.estMinutes <= budget) {
          acc.list.push(t);
          acc.used += t.estMinutes;
        }
        return acc;
      }, { list: [], used: 0 }).list;
  const doneCount = routine.tasks.filter((t) => completedIds.has(t.id)).length;
  const completedWithTopic = routine.tasks.filter((t) => completedIds.has(t.id) && t.topic);

  return (
    <Card className="p-3" data-tour="plan">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] uppercase tracking-widest text-red-600 font-semibold">Today&apos;s Study Plan</p>
        <div className="flex items-center gap-1.5">
          {/* The size of today, stated. A student who set 11 hours and sees
              four should never have to ask us why. */}
          {data.todayBudget && (
            <span className="inline-flex items-center rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-700">
              {data.todayBudget.hours}h today
            </span>
          )}
          {!fullyDone && (
            <span className="inline-flex items-center gap-1 rounded-full bg-stone-200 px-2 py-0.5 text-[11px] font-semibold text-stone-900">🟢 Planned</span>
          )}
        </div>
      </div>

      {/* Why it is that size, but only when it differs from what they asked
          for — otherwise it is noise on every single day. */}
      {!fullyDone && data.todayBudget?.trimmed && data.todayBudget.reason && (
        <p className="mb-1.5 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-[11px] font-medium text-stone-600">
          {data.todayBudget.reason}
        </p>
      )}

      {/* The engine's daily auto-adjustment, said OUT LOUD — students should
          know the plan recalculates from what they actually did, every day. */}
      {/* The because-line: proof, not a claim. "Geometry first — it didn't
          get finished yesterday" is what makes a student feel their check-in
          changed their plan. Only ever rendered when the statement is TRUE
          (plan-reason.ts enforces it); otherwise the generic line below. */}
      {!fullyDone && data.because ? (
        <p className="mb-1.5 rounded-lg border border-orange-100 bg-orange-50 px-2.5 py-1.5 text-[11px] font-medium text-orange-800">
          <span className="mr-1 font-bold uppercase tracking-wide text-orange-500 text-[9px]">Built from your check-in</span>
          <br />{data.because.line}
        </p>
      ) : null}
      {!fullyDone && !data.because && (data.isCatchUp ? (
        <p className="mb-1.5 rounded-lg bg-teal-50 border border-teal-100 px-2.5 py-1.5 text-[11px] font-medium text-teal-800">
          ⚡ Welcome back — your plan has already adjusted around the missed days. Only today matters.
        </p>
      ) : data.yesterday && data.yesterday.total > 0 ? (
        <p className="mb-1.5 rounded-lg bg-stone-50 border border-stone-100 px-2.5 py-1.5 text-[11px] font-medium text-stone-600">
          {data.yesterday.done >= data.yesterday.total
            ? `⚡ Yesterday: all ${data.yesterday.total} done — today's plan builds on it.`
            : `⚡ Yesterday: ${data.yesterday.done} of ${data.yesterday.total} done — today's plan has already adjusted. Nothing lost.`}
        </p>
      ) : null)}

      {/* Today's Goal — the one number that matters, read at a glance. */}
      {!fullyDone && (
        <div className="flex items-center gap-1.5 mb-1.5">
          {routine.tasks.map((t) => (
            <span
              key={t.id}
              className={cn('h-1.5 w-1.5 rounded-full', completedIds.has(t.id) ? 'bg-stone-900' : 'bg-stone-200')}
            />
          ))}
          <span className="text-[11px] text-stone-400 ml-1">{doneCount} of {routine.tasks.length} done</span>
        </div>
      )}

      {fullyDone ? (
        <div className="py-3">
          {/* Forward-pull, not a finish line — the app's job is to make
              tomorrow morning feel easier than today did, not to mark today
              closed. "Done" reads as an ending; "Ready for tomorrow" reads
              as momentum. */}
          <p className="text-lg font-bold text-stone-900 text-center mb-3">Ready for tomorrow ✅</p>
          <div className="space-y-1 text-center">
            {completedWithTopic.length > 0 && (
              <p className="text-sm text-stone-600">Plan updated · {completedWithTopic.length} topic{completedWithTopic.length === 1 ? '' : 's'}</p>
            )}
            {confidenceTaps.filter((t) => t.confidence === 'green').length > 0 && (
              <p className="text-sm text-stone-600">{confidenceTaps.filter((t) => t.confidence === 'green').map((t) => t.topic).join(', ')} ↑</p>
            )}
            <p className="text-sm text-stone-600">Your next step is already being built — open tomorrow and go</p>
          </div>
          {(calibrated || data.routine.calibration) ? (
            <p className="mt-4 text-center text-xs font-medium text-teal-700">✓ Noted — this tunes tomorrow&apos;s plan.</p>
          ) : (
            <div className="mt-4">
              <p className="text-center text-xs font-semibold text-stone-500 mb-2">Today&apos;s plan was…</p>
              <div className="flex justify-center gap-2">
                {([['too_easy', 'Too easy'], ['just_right', 'Just right'], ['too_much', 'Too much']] as const).map(([v, label]) => (
                  <button
                    key={v}
                    onClick={() => calibrate(v)}
                    disabled={calibrationBusy}
                    className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 transition-transform active:scale-95 disabled:opacity-50"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-1">
            {tasks.map((task, idx) => {
              const done = completedIds.has(task.id);
              const isStart = idx === 0 && !done;
              const expanded = expandedTaskId === task.id && !done;

              // Task 1 gets the hero treatment — full detail, big and hard to
              // miss. Everything after it is a compact single line: still
              // real, still tappable (never gated — a student choosing to
              // skip ahead is making a real choice, not cheating), just not
              // shouting for the same attention as the one thing to do now.
              if (isStart || expanded) {
                const swapOpen = swapTaskId === task.id;
                return (
                  <div key={task.id}>
                    <div
                      className={cn(
                        'w-full flex items-start gap-2.5 rounded-2xl bg-stone-100/70 p-2.5 transition-all',
                        (expanded || swapOpen) && 'rounded-b-none'
                      )}
                    >
                      {/* Display only — you mark topics done when you fill the
                          log, not here. The only action on the plan is swap. */}
                      <span aria-hidden className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-stone-300" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 bg-stone-900 text-white">
                            {isStart ? 'Start Here' : 'Next'}
                          </span>
                          <span className="text-xs text-stone-400 ml-auto shrink-0">{task.estMinutes}m</span>
                        </div>
                        <p className="text-base font-bold mt-1.5 text-stone-900">{taskTitle(task)}</p>
                        {!done && task.reason && (
                          <p className="mt-0.5 text-[11px] leading-snug text-stone-500">{task.reason}</p>
                        )}
                        {/* Verified student contributions for THIS topic —
                            curriculum injection, shown exactly where the work
                            is about to happen and nowhere else. */}
                        {!done && task.topic && (
                          <div className="mt-2"><TopicInsights topic={task.topic} /></div>
                        )}
                      </div>
                      {/* Swap today's topic — same section, student's choice. */}
                      {!done && task.topic && (
                        <button
                          data-tour="swap"
                          onClick={() => setSwapTaskId((cur) => (cur === task.id ? null : task.id))}
                          aria-label="Change today's topic"
                          title="Change today's topic"
                          className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[11px] font-bold text-indigo-700 transition-transform active:scale-95"
                        >
                          ⇄ Swap
                        </button>
                      )}
                    </div>
                    {swapOpen && !done && task.topic && (
                      <div className={cn('bg-stone-100/70 px-4 pb-4 pt-1', expanded ? '' : 'rounded-b-2xl')}>
                        <p className="mb-1.5 text-[11px] font-semibold text-stone-500">
                          Swap today&apos;s {task.section} topic — your plan, your call:
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {(SECTION_TOPICS[task.section] ?? []).filter((t) => t !== task.topic).map((t) => (
                            <button
                              key={t}
                              onClick={() => swapTopic(task, t)}
                              disabled={swapBusy}
                              className="rounded-full border border-stone-300 bg-white px-2.5 py-1 text-[11px] font-medium text-stone-700 transition-transform active:scale-95 disabled:opacity-50"
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <div key={task.id}>
                  <div className={cn('w-full flex items-center gap-2.5 rounded-xl bg-stone-50 px-3.5 py-3', swapTaskId === task.id && !done && task.topic && 'rounded-b-none')}>
                    {/* Display only — completion happens in the log. */}
                    <span
                      aria-hidden
                      className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
                        done ? 'border-stone-900 bg-stone-900' : 'border-stone-300'
                      )}
                    >
                      {done && <Check className="w-3 h-3 text-white" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className={cn('text-sm font-semibold', done ? 'text-stone-400 line-through' : 'text-stone-800')}>
                        {taskTitle(task)}
                      </span>
                      {!done && task.reason && (
                        <p className="mt-0.5 text-[11px] leading-snug text-stone-500">{task.reason}</p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-stone-400">{task.estMinutes}m</span>
                    {/* Swap today's topic — same section, student's choice. */}
                    {!done && task.topic && (
                      <button
                        onClick={() => setSwapTaskId((cur) => (cur === task.id ? null : task.id))}
                        aria-label="Change today's topic"
                        title="Change today's topic"
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[11px] font-bold text-indigo-700 transition-transform active:scale-95"
                      >
                        ⇄ Swap
                      </button>
                    )}
                  </div>
                  {swapTaskId === task.id && !done && task.topic && (
                    <div className="rounded-b-2xl bg-stone-100/70 px-4 pb-4 pt-1">
                      <p className="mb-1.5 text-[11px] font-semibold text-stone-500">
                        Swap today&apos;s {task.section} topic — your plan, your call:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {(SECTION_TOPICS[task.section] ?? []).filter((t) => t !== task.topic).map((t) => (
                          <button
                            key={t}
                            onClick={() => swapTopic(task, t)}
                            disabled={swapBusy}
                            className="rounded-full border border-stone-300 bg-white px-2.5 py-1 text-[11px] font-medium text-stone-700 transition-transform active:scale-95 disabled:opacity-50"
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {swapNote && (
            <p className="mt-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-[11px] font-medium text-teal-800">
              ✓ {swapNote}
            </p>
          )}

          <div className="mt-3">
            <Link href="/student/blueprint" className="text-xs font-semibold text-stone-900">My CAT Plan →</Link>
          </div>
        </>
      )}
    </Card>
  );
}
