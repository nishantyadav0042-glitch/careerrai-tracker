'use client';
/* eslint-disable react-hooks/purity -- Date.now() below only ever runs
   inside a click handler (reportStart, called from handleTaskTap), never
   during render; the linter can't see that from the call site. */
import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { QuickRoutineSetup } from './QuickRoutineSetup';

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
  routine: { phase: string; tasks: RoutineTask[]; est_minutes: number };
  completions: { task_id: string; is_emergency: boolean }[];
  currentStreak: number;
  isCatchUp: boolean;
}

interface NeedsSetupResponse {
  needsSetup: true;
  weakestSection: 'VARC' | 'DILR' | 'QA' | null;
  weakTopic: string | null;
  currentStage: 'not_started' | 'concepts' | 'questions' | 'sectionals' | 'mocks' | null;
  biggestBlocker: 'inconsistency' | 'dont_know_what' | 'mock_anxiety' | 'time_wasting' | null;
  needsWeekendHours: boolean;
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
const TIME_OPTIONS: { value: TimeBudget; label: string }[] = [
  { value: 'planned', label: '🟢 Planned' },
  { value: 30, label: '⏱️ Less time today (30m)' },
];

// Fallback for routines generated before targets existed.
function taskTitle(task: RoutineTask): string {
  if (task.target) return task.target;
  if (task.topic) return `Solve ${Math.max(5, Math.round(task.estMinutes / 3))} ${task.topic} questions`;
  return task.label;
}

// The engine already knows whether this topic is fresh or a continuation —
// chooseTopicForSection advances/holds coverage status per confidence tap
// (see topic-selector.ts). That used to be invisible: the task copy read
// identically whether it was day 1 or day 4 on the same topic. A student
// re-seeing "Solve RC questions" with no acknowledgment reads it as the app
// not noticing their own progress, even when the underlying pick was
// correct. This badge says the quiet part out loud.
// Wording in the student's own head, not the engine's internal vocabulary —
// "EXAM READY" is how the Coverage Matrix labels it internally, but no
// CAT aspirant thinks "this topic is exam ready"; they think "I'm
// comfortable with this." NEW deliberately isn't "Start Here" — that phrase
// is already the position-in-list tag on the first task below and would
// collide with a second, different meaning right next to it.
const CONTINUITY_BADGE: Record<CoverageStatus, { label: string; style: string }> = {
  not_started: { label: 'NEW', style: 'bg-teal-50 text-teal-700 border-teal-200' },
  learning: { label: 'CONTINUE', style: 'bg-blue-50 text-blue-700 border-blue-200' },
  practicing: { label: 'CONTINUE', style: 'bg-blue-50 text-blue-700 border-blue-200' },
  revising: { label: 'BACK FOR REVISION', style: 'bg-orange-50 text-orange-700 border-orange-200' },
  exam_ready: { label: 'COMFORTABLE', style: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

export function TodaysRoutineCard() {
  const [data, setData] = useState<RoutineResponse | null>(null);
  const [needsSetup, setNeedsSetup] = useState<NeedsSetupResponse | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [budget, setBudget] = useState<TimeBudget>('planned');
  const [fullyDone, setFullyDone] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
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
      const res = await fetch('/api/routine/today');
      if (!res.ok) return;
      const json = (await res.json()) as RoutineResponse | NeedsSetupResponse;
      if ('needsSetup' in json) {
        setNeedsSetup(json);
        setData(null);
        return;
      }
      setNeedsSetup(null);
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
      const json = (await res.json()) as { completedTaskIds: string[]; fullyDone: boolean };
      setCompletedIds(new Set(json.completedTaskIds));
      setExpandedTaskId(null);
      if (confidence && task.topic) setConfidenceTaps((prev) => [...prev, { topic: task.topic!, confidence }]);
      if (json.fullyDone) { setFullyDone(true); reportComplete(); }
    } finally {
      setBusyTaskId(null);
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
  if (needsSetup) {
    return (
      <Card className="p-5">
        <p className="text-xs uppercase tracking-widest text-orange-600 font-semibold mb-3">Today&apos;s Study Plan</p>
        <QuickRoutineSetup
          initialWeakest={needsSetup.weakestSection}
          initialWeakTopic={needsSetup.weakTopic}
          initialStage={needsSetup.currentStage}
          initialBlocker={needsSetup.biggestBlocker}
          needsWeekendHours={needsSetup.needsWeekendHours}
          onDone={load}
        />
      </Card>
    );
  }
  if (!data) return null;

  const { routine, isCatchUp } = data;
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
    <Card className="p-5">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs uppercase tracking-widest text-orange-600 font-semibold">Today&apos;s Study Plan</p>
        {!fullyDone && (
          <div className="flex gap-1 text-[11px] font-semibold">
            {TIME_OPTIONS.map(({ value, label }) => (
              <button
                key={String(value)}
                onClick={() => setBudget(value)}
                className={cn(
                  'rounded-full px-2 py-0.5 transition-colors',
                  budget === value ? 'bg-orange-100 text-orange-700' : 'text-stone-400'
                )}
              >
                {value === 30 ? 'Less time' : label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Today's Goal — the one number that matters, read at a glance. */}
      {!fullyDone && (
        <div className="flex items-center gap-1.5 mb-3">
          {routine.tasks.map((t) => (
            <span
              key={t.id}
              className={cn('h-2 w-2 rounded-full', completedIds.has(t.id) ? 'bg-teal-500' : 'bg-stone-200')}
            />
          ))}
          <span className="text-xs text-stone-400 ml-1">{doneCount} of {routine.tasks.length} done</span>
        </div>
      )}

      {isCatchUp && !fullyDone && (
        <p className="mb-3 text-xs text-teal-700 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2">Welcome back 👋 Today&apos;s priority is ready.</p>
      )}

      {/* The engine, made visible. Every one of these bullets already exists
          as a per-task "why today" reason — this just says them together,
          once, before the student has to read three separate cards to piece
          it together themselves. */}
      {!fullyDone && routine.tasks.some((t) => t.reason) && (
        <ul className="mb-3 space-y-1">
          {routine.tasks.filter((t) => t.reason).slice(0, 3).map((t) => (
            <li key={t.id} className="text-xs text-stone-500 flex gap-1.5">
              <span className="text-stone-300">•</span>{t.reason}
            </li>
          ))}
        </ul>
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
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
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
                return (
                  <div key={task.id}>
                    <button
                      onClick={() => handleTaskTap(task, done)}
                      disabled={busyTaskId === task.id}
                      className={cn(
                        'w-full flex items-start gap-3 rounded-2xl bg-orange-50/70 p-4 text-left transition-all active:scale-[0.99]',
                        expanded && 'rounded-b-none'
                      )}
                    >
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-orange-500" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 bg-orange-600 text-white">
                            {isStart ? 'Start Here' : 'Next'}
                          </span>
                          {task.coverageStatus != null && (
                            <span className={cn(
                              'text-[9px] font-bold uppercase tracking-wider rounded border px-1.5 py-0.5',
                              CONTINUITY_BADGE[task.coverageStatus].style
                            )}>
                              {CONTINUITY_BADGE[task.coverageStatus].label}
                            </span>
                          )}
                          <span className="text-xs text-stone-400 ml-auto shrink-0">{task.estMinutes}m</span>
                        </div>
                        <p className="text-base font-bold mt-1.5 text-stone-900">{taskTitle(task)}</p>
                        {memoryTag(task) && (
                          <p className="text-[11px] text-stone-400 mt-0.5">{memoryTag(task)}</p>
                        )}
                        {task.reason && (
                          <p className="text-xs text-stone-500 mt-1"><span className="text-stone-400">Why today?</span> {task.reason}</p>
                        )}
                      </div>
                    </button>
                    {expanded && (
                      <div className="rounded-b-2xl bg-orange-50/70 px-4 pb-4 pt-1">
                        {/* 2x2, not a single row of 4 — "Getting there" and
                            "Struggling" don't fit four-across on a phone
                            without wrapping mid-word. */}
                        <div className="grid grid-cols-2 gap-2">
                          {CONFIDENCE_OPTIONS.map((opt) => (
                            <button
                              key={opt.value}
                              onClick={() => toggleTask(task, opt.value)}
                              disabled={busyTaskId === task.id}
                              className="flex flex-col items-center gap-0.5 rounded-lg border border-orange-200 bg-white py-2 text-xs font-medium text-stone-700 active:scale-[0.97] transition-all"
                            >
                              <span className="text-lg leading-none">{opt.emoji}</span>
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <button
                  key={task.id}
                  onClick={() => handleTaskTap(task, done)}
                  disabled={busyTaskId === task.id}
                  className="w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-stone-50 active:scale-[0.99]"
                >
                  <span className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
                    done ? 'border-teal-600 bg-teal-600' : 'border-stone-300'
                  )}>
                    {done && <Check className="w-2.5 h-2.5 text-white" />}
                  </span>
                  <span className={cn('text-sm flex-1 min-w-0 truncate', done ? 'text-stone-400 line-through' : 'text-stone-600')}>
                    {taskTitle(task)}
                  </span>
                  <span className="text-xs text-stone-400 shrink-0">{task.estMinutes}m</span>
                </button>
              );
            })}
          </div>

          <div className="mt-3">
            <Link href="/student/blueprint" className="text-xs font-semibold text-orange-600">My CAT Plan →</Link>
          </div>
        </>
      )}
    </Card>
  );
}
