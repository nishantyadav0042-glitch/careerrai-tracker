'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { QuickRoutineSetup } from './QuickRoutineSetup';
import { TOPIC_METADATA } from '@/lib/topics-constants';

interface RoutineTask {
  id: string;
  section: string;
  topic: string | null;
  label: string;
  target?: string | null; // executable goal — older stored routines predate it
  estMinutes: number;
  reason: string | null;
  isImplementationIntention?: boolean;
}

type ConfidenceSignal = 'green' | 'yellow' | 'red';
const CONFIDENCE_OPTIONS: { value: ConfidenceSignal; emoji: string; label: string }[] = [
  { value: 'green', emoji: '🟢', label: 'Nailed it' },
  { value: 'yellow', emoji: '🟡', label: 'Okay' },
  { value: 'red', emoji: '🔴', label: 'Shaky' },
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
// 'planned' = the full plan (default; most days nobody changes it).
type TimeBudget = 30 | 60 | 120 | 'planned';
const TIME_OPTIONS: { value: TimeBudget; label: string }[] = [
  { value: 30, label: '30m' },
  { value: 60, label: '1h' },
  { value: 120, label: '2h' },
  { value: 'planned', label: '🟢 Planned' },
];

// Today's Win — a real prerequisite edge from the Knowledge Graph.
function todaysWin(tasks: RoutineTask[]): { finish: string; unlocks: string } | null {
  const todayTopics = tasks.map((t) => t.topic).filter((t): t is string => t != null);
  for (const topic of todayTopics) {
    const unlocked = Object.entries(TOPIC_METADATA).find(
      ([candidate, meta]) => !todayTopics.includes(candidate) && meta.prerequisites.includes(topic)
    );
    if (unlocked) return { finish: topic, unlocks: unlocked[0] };
  }
  return null;
}

// Fallback for routines generated before targets existed.
function taskTitle(task: RoutineTask): string {
  if (task.target) return task.target;
  if (task.topic) return `Solve ${Math.max(5, Math.round(task.estMinutes / 3))} ${task.topic} questions`;
  return task.label;
}

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
    } finally {
      setLoading(false);
    }
  }, []);

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
      if (json.fullyDone) setFullyDone(true);
    } finally {
      setBusyTaskId(null);
    }
  }

  function handleTaskTap(task: RoutineTask, done: boolean) {
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
        <p className="text-xs uppercase tracking-widest text-orange-600 font-semibold mb-3">Today&apos;s Study</p>
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
  const win = todaysWin(routine.tasks);
  const doneCount = routine.tasks.filter((t) => completedIds.has(t.id)).length;
  const completedWithTopic = routine.tasks.filter((t) => completedIds.has(t.id) && t.topic);

  return (
    <Card className="p-5">
      <p className="text-xs uppercase tracking-widest text-orange-600 font-semibold mb-3">Today&apos;s Study</p>

      {isCatchUp && !fullyDone && (
        <p className="mb-3 text-xs text-teal-700 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2">Welcome back 👋 Today&apos;s priority is ready.</p>
      )}

      {fullyDone ? (
        <div className="py-3">
          <p className="text-lg font-bold text-stone-900 text-center mb-3">Today&apos;s Study Done ✅</p>
          <div className="space-y-1 text-center">
            {completedWithTopic.length > 0 && (
              <p className="text-sm text-stone-600">Plan updated · {completedWithTopic.length} topic{completedWithTopic.length === 1 ? '' : 's'}</p>
            )}
            {confidenceTaps.filter((t) => t.confidence === 'green').length > 0 && (
              <p className="text-sm text-stone-600">{confidenceTaps.filter((t) => t.confidence === 'green').map((t) => t.topic).join(', ')} ↑</p>
            )}
            <p className="text-sm text-stone-600">Tomorrow adapts overnight</p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-1.5 mb-4">
            {TIME_OPTIONS.map(({ value, label }) => (
              <button
                key={String(value)}
                onClick={() => setBudget(value)}
                className={cn(
                  'rounded-lg border py-1.5 text-xs font-semibold transition-all active:scale-95',
                  budget === value ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-stone-200 bg-white text-stone-500'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {tasks.map((task, idx) => {
              const done = completedIds.has(task.id);
              const isStart = idx === 0 && !done;
              const expanded = expandedTaskId === task.id && !done;
              return (
                <div key={task.id}>
                  <button
                    onClick={() => handleTaskTap(task, done)}
                    disabled={busyTaskId === task.id}
                    className={cn(
                      'w-full flex items-start gap-3 rounded-xl border p-3 text-left transition-all active:scale-[0.99]',
                      done ? 'border-teal-200 bg-teal-50'
                        : expanded || isStart ? 'border-orange-300 bg-orange-50/60'
                        : 'border-stone-200 bg-white',
                      expanded && 'rounded-b-none border-b-0'
                    )}
                  >
                    <span className={cn(
                      'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
                      done ? 'border-teal-600 bg-teal-600' : isStart || expanded ? 'border-orange-500' : 'border-stone-300'
                    )}>
                      {done && <Check className="w-3 h-3 text-white" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          'text-[9px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5',
                          isStart ? 'bg-orange-600 text-white' : 'bg-stone-100 text-stone-400'
                        )}>
                          {isStart ? 'Start Here' : done ? 'Done' : 'Next'}
                        </span>
                        <span className="text-xs text-stone-400 ml-auto shrink-0">{task.estMinutes}m</span>
                      </div>
                      <p className={cn('text-sm font-bold mt-1', done ? 'text-teal-800 line-through' : 'text-stone-900')}>
                        {taskTitle(task)}
                      </p>
                      {!done && task.reason && (
                        <p className="text-xs text-stone-500 mt-0.5"><span className="text-stone-400">Why?</span> {task.reason}</p>
                      )}
                    </div>
                  </button>
                  {expanded && (
                    <div className="rounded-b-xl border border-t-0 border-orange-300 bg-orange-50/60 px-3 pb-3 pt-1">
                      <div className="flex gap-2">
                        {CONFIDENCE_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => toggleTask(task, opt.value)}
                            disabled={busyTaskId === task.id}
                            className="flex-1 flex flex-col items-center gap-0.5 rounded-lg border border-orange-200 bg-white py-2 text-xs font-medium text-stone-700 active:scale-[0.97] transition-all"
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
            })}
          </div>

          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-stone-500">{doneCount}/{routine.tasks.length} done</p>
            <Link href="/student/blueprint" className="text-xs font-semibold text-orange-600">My CAT Plan →</Link>
          </div>

          {win && (
            <p className="mt-2.5 rounded-xl bg-stone-900 px-3.5 py-2 text-xs text-white">
              🏁 Finish {win.finish} → unlocks {win.unlocks}
            </p>
          )}
        </>
      )}
    </Card>
  );
}
