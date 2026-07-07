'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Check, Flame } from 'lucide-react';
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
  { value: 'red', emoji: '🔴', label: 'Still shaky' },
];

interface Mission {
  id: string;
  label: string;
  reasons: string[];
}

interface RoutineResponse {
  routine: { phase: string; tasks: RoutineTask[]; est_minutes: number };
  whySummary: string;
  mission: Mission;
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

// Today I have: three positions, "As planned" is the default — most days a
// student changes nothing. "30 mins" collapses to the single priority task
// (the old Emergency Mode); "Extra time" keeps the full plan and adds an
// honest suggestion instead of inventing filler tasks.
type TimeMode = 'thirty' | 'planned' | 'extra';

const SECTION_SQUARE: Record<string, string> = {
  QA: '🟦',
  VARC: '🟨',
  DILR: '🟩',
  General: '⬜',
};

// Today's Win — a real prerequisite edge from the Knowledge Graph: finishing
// a topic that other topics build on is progress toward unlocking them.
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

// Fallback executable target for routines generated before targets existed.
function taskTarget(task: RoutineTask): string {
  if (task.target) return task.target;
  if (task.topic) return `Solve ${Math.max(5, Math.round(task.estMinutes / 3))} questions`;
  return `${task.estMinutes} focused minutes`;
}

export function TodaysRoutineCard() {
  const [data, setData] = useState<RoutineResponse | null>(null);
  const [needsSetup, setNeedsSetup] = useState<NeedsSetupResponse | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [timeMode, setTimeMode] = useState<TimeMode>('planned');
  const [fullyDone, setFullyDone] = useState(false);
  const [emergencyAcknowledged, setEmergencyAcknowledged] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [showWhy, setShowWhy] = useState(false);
  // Real deltas for the "Blueprint updated" close — every entry corresponds
  // to something that actually changed (a confidence tap that fed the map).
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
        body: JSON.stringify({ task_id: task.id, is_emergency: timeMode === 'thirty', ...(confidence ? { confidence } : {}) }),
      });
      if (!res.ok) return;
      const json = (await res.json()) as { completedTaskIds: string[]; fullyDone: boolean; emergencyMinimumDone: boolean };
      setCompletedIds(new Set(json.completedTaskIds));
      setExpandedTaskId(null);
      if (confidence && task.topic) setConfidenceTaps((prev) => [...prev, { topic: task.topic!, confidence }]);
      if (json.fullyDone) setFullyDone(true);
      else if (json.emergencyMinimumDone) {
        setEmergencyAcknowledged(true);
        setTimeMode('planned'); // reveal the rest of the list, don't hide it
      }
    } finally {
      setBusyTaskId(null);
    }
  }

  function handleTaskTap(task: RoutineTask, done: boolean) {
    if (done) { toggleTask(task); return; } // un-complete, no confidence involved
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
        <p className="text-xs uppercase tracking-widest text-orange-600 font-semibold mb-3">Today&apos;s Mission</p>
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

  const { routine, whySummary, mission, currentStreak, isCatchUp } = data;
  const tasks = timeMode === 'thirty' ? routine.tasks.slice(0, 1) : routine.tasks;
  const win = todaysWin(routine.tasks);
  const sectionsToday = [...new Set(routine.tasks.map((t) => t.section))];
  const completedWithTopic = routine.tasks.filter((t) => completedIds.has(t.id) && t.topic);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs uppercase tracking-widest text-orange-600 font-semibold">Today&apos;s Mission</p>
        {currentStreak > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-stone-500">
            <Flame className="w-3.5 h-3.5 text-orange-500" />{currentStreak}
          </span>
        )}
      </div>

      {isCatchUp && !fullyDone && (
        <div className="mb-4 rounded-xl bg-teal-50 border border-teal-200 px-3.5 py-2.5">
          <p className="text-sm font-bold text-teal-900">Welcome back 👋</p>
          <p className="text-xs text-teal-700 mt-0.5">Ignore the gap — here&apos;s today&apos;s priority.</p>
        </div>
      )}

      {fullyDone ? (
        // Not "completed" — the Blueprint EVOLVED. Every line below is a real
        // change this session actually made.
        <div className="py-4">
          <p className="text-lg font-bold text-stone-900 text-center mb-3">Today&apos;s Blueprint updated 🎉</p>
          <div className="space-y-1.5">
            {completedWithTopic.length > 0 && (
              <p className="text-sm text-stone-700 flex gap-2"><span className="text-teal-600">✓</span>{completedWithTopic.length} topic{completedWithTopic.length === 1 ? '' : 's'} fed back into your preparation map</p>
            )}
            {confidenceTaps.map((t) => (
              <p key={t.topic + t.confidence} className="text-sm text-stone-700 flex gap-2">
                <span className="text-teal-600">✓</span>
                {t.confidence === 'green' ? `${t.topic} moved up a level` : t.confidence === 'red' ? `${t.topic} flagged for relearning — tomorrow adapts` : `${t.topic} logged — steady`}
              </p>
            ))}
            <p className="text-sm text-stone-700 flex gap-2"><span className="text-teal-600">✓</span>Preparation Memory +1 day</p>
            <p className="text-sm text-stone-700 flex gap-2"><span className="text-teal-600">✓</span>Tomorrow&apos;s mission adapts to today overnight</p>
          </div>
        </div>
      ) : (
        <>
          {/* Time position — "As planned" is the default; changing it is the
              exception, not a daily decision. */}
          <div className="mb-3.5">
            <p className="text-[10px] uppercase tracking-widest text-stone-400 font-bold mb-1.5">Today I have</p>
            <div className="grid grid-cols-3 gap-1.5">
              {([
                ['thirty', '30 mins'],
                ['planned', '🟢 As planned'],
                ['extra', 'Extra time'],
              ] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => setTimeMode(mode)}
                  className={cn(
                    'rounded-lg border py-1.5 text-xs font-semibold transition-all active:scale-95',
                    timeMode === mode ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-stone-200 bg-white text-stone-500 hover:border-stone-300'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {timeMode === 'extra' && (
              <p className="text-[11px] text-stone-500 mt-1.5">
                Finish the plan first — then rerun whichever task felt shakiest. Extra time compounds fastest on weak spots.
              </p>
            )}
          </div>

          {/* Priority mission banner — one line of coaching, no paragraph */}
          {mission.reasons.length > 0 && (
            <div className="mb-3 rounded-xl border border-orange-200 bg-orange-50/70 px-3.5 py-2.5">
              <p className="text-sm font-bold text-stone-900">{mission.label}</p>
              <p className="text-xs text-orange-800 mt-0.5">{mission.reasons[0]}</p>
            </div>
          )}

          {emergencyAcknowledged && (
            <div className="mb-3 rounded-xl bg-orange-50 border border-orange-200 px-3.5 py-2.5">
              <p className="text-sm font-bold text-orange-900">Minimum done for today ✓</p>
              <p className="text-xs text-orange-700 mt-0.5">Your streak is safe. Keep going below if you have more time.</p>
            </div>
          )}

          {/* Today's Mix — balance at a glance, no reading required */}
          <div className="flex items-center gap-3 mb-4 text-xs text-stone-600">
            <span className="text-[10px] uppercase tracking-widest text-stone-400 font-bold">Mix</span>
            {sectionsToday.map((s) => (
              <span key={s} className="inline-flex items-center gap-1">{SECTION_SQUARE[s] ?? '⬜'} {s}</span>
            ))}
          </div>

          <div className="space-y-2">
            {tasks.map((task) => {
              const done = completedIds.has(task.id);
              const vivid = task.isImplementationIntention && !done;
              const expanded = expandedTaskId === task.id && !done;
              return (
                <div key={task.id}>
                  <button
                    onClick={() => handleTaskTap(task, done)}
                    disabled={busyTaskId === task.id}
                    className={cn(
                      'w-full flex items-start gap-3 rounded-xl border p-3 text-left transition-all active:scale-[0.99]',
                      done ? 'border-teal-200 bg-teal-50'
                        : expanded ? 'border-orange-400 bg-orange-50/60'
                        : vivid ? 'border-orange-300 bg-orange-50/60 hover:border-orange-400'
                        : 'border-stone-200 bg-white hover:border-stone-300',
                      expanded && 'rounded-b-none border-b-0'
                    )}
                  >
                    <span className={cn(
                      'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                      done ? 'border-teal-600 bg-teal-600' : vivid || expanded ? 'border-orange-500' : 'border-stone-300'
                    )}>
                      {done && <Check className="w-3 h-3 text-white" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className={cn('text-sm font-bold', done ? 'text-teal-800 line-through' : 'text-stone-900')}>
                          {task.label}
                        </p>
                        <span className="shrink-0 text-xs font-medium text-stone-400">{task.estMinutes}m</span>
                      </div>
                      {!done && (
                        <>
                          <p className="text-xs font-semibold text-stone-700 mt-1">🎯 {taskTarget(task)}</p>
                          {task.reason && (
                            <p className={cn('text-xs mt-0.5', vivid ? 'font-semibold text-orange-700' : 'text-stone-500')}>
                              <span className="font-semibold text-stone-400">Why today? </span>{task.reason}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </button>
                  {expanded && (
                    <div className="rounded-b-xl border border-t-0 border-orange-400 bg-orange-50/60 px-3 pb-3 pt-1">
                      <p className="text-xs font-semibold text-orange-800 mb-2">How did that go?</p>
                      <div className="flex gap-2">
                        {CONFIDENCE_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => toggleTask(task, opt.value)}
                            disabled={busyTaskId === task.id}
                            className="flex-1 flex flex-col items-center gap-0.5 rounded-lg border border-orange-200 bg-white py-2 text-xs font-medium text-stone-700 hover:border-orange-400 active:scale-[0.97] transition-all"
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

          {/* Today's Win — achievement, not another task. Prerequisite edge
              straight from the Knowledge Graph. */}
          {win && timeMode !== 'thirty' && (
            <div className="mt-3 rounded-xl bg-stone-900 px-3.5 py-2.5">
              <p className="text-[10px] uppercase tracking-widest text-orange-400 font-bold">🏁 Today&apos;s Win</p>
              <p className="text-sm font-semibold text-white mt-0.5">Finish {win.finish} → one step from unlocking {win.unlocks}</p>
            </div>
          )}

          <div className="mt-3.5 flex items-center justify-between">
            <button onClick={() => setShowWhy((v) => !v)} className="text-xs text-stone-400 hover:text-stone-600">
              {showWhy ? 'Hide' : 'Why this plan?'}
            </button>
            <Link href="/student/blueprint" className="text-xs font-semibold text-orange-600 hover:text-orange-700">
              Full Blueprint →
            </Link>
          </div>
          {showWhy && <p className="text-xs text-stone-400 mt-1.5">{whySummary}</p>}
        </>
      )}
    </Card>
  );
}
