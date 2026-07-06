'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Check, Clock, Zap, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import { QuickRoutineSetup } from './QuickRoutineSetup';

interface RoutineTask {
  id: string;
  section: string;
  topic: string | null;
  label: string;
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

interface RoadmapPhase {
  id: string;
  label: string;
  weekRange: string;
  objective: string;
  dailyFocus: string;
  weeklyFocus: string;
}

interface Roadmap {
  weeksRemaining: number;
  currentIndex: number;
  phases: RoadmapPhase[];
}

interface RoutineResponse {
  routine: { phase: string; tasks: RoutineTask[]; est_minutes: number };
  whySummary: string;
  mission: Mission;
  roadmap: Roadmap;
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

export function TodaysRoutineCard() {
  const [data, setData] = useState<RoutineResponse | null>(null);
  const [needsSetup, setNeedsSetup] = useState<NeedsSetupResponse | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [emergencyMode, setEmergencyMode] = useState(false);
  // Full completion is a real terminal state (checklist replaced by the closure
  // message). Emergency-minimum is NOT — per spec it must stay "distinct from
  // full completion, not hidden": acknowledge it, then keep the rest of the
  // list visible in case the student wants to keep going.
  const [fullyDone, setFullyDone] = useState(false);
  const [emergencyAcknowledged, setEmergencyAcknowledged] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Confidence-aware planning: a topic-bearing task asks "how did that go?"
  // instead of completing on the first tap — one deliberate tap either way,
  // just choosing which of 3 outcomes rather than a plain checkbox, and the
  // answer feeds the Coverage Matrix the Topic Selector reads for tomorrow.
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

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

  async function toggleTask(taskId: string, confidence?: ConfidenceSignal) {
    if (busyTaskId) return;
    setBusyTaskId(taskId);
    try {
      const res = await fetch('/api/routine/complete-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId, is_emergency: emergencyMode, ...(confidence ? { confidence } : {}) }),
      });
      if (!res.ok) return;
      const json = (await res.json()) as { completedTaskIds: string[]; fullyDone: boolean; emergencyMinimumDone: boolean };
      setCompletedIds(new Set(json.completedTaskIds));
      setExpandedTaskId(null);
      if (json.fullyDone) setFullyDone(true);
      else if (json.emergencyMinimumDone) {
        setEmergencyAcknowledged(true);
        setEmergencyMode(false); // reveal the rest of the list, don't hide it
      }
    } finally {
      setBusyTaskId(null);
    }
  }

  function handleTaskTap(task: RoutineTask, done: boolean) {
    if (done) { toggleTask(task.id); return; } // un-complete, no confidence involved
    if (task.topic) { setExpandedTaskId((cur) => (cur === task.id ? null : task.id)); return; }
    toggleTask(task.id); // no topic to attach a confidence signal to — complete outright
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
        <p className="text-xs uppercase tracking-widest text-orange-600 font-semibold mb-3">Today&apos;s Routine</p>
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

  const { routine, whySummary, mission, roadmap, currentStreak, isCatchUp } = data;
  const currentPhase = roadmap.phases[roadmap.currentIndex];
  const tasks = emergencyMode ? routine.tasks.slice(0, 1) : routine.tasks;
  const totalMinutes = emergencyMode ? tasks[0]?.estMinutes ?? 0 : routine.est_minutes;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const timeLabel = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  return (
    <Card className="p-5">
      {/* Your CAT Roadmap — the 5-phase canonical strategy this routine
          executes, and where this student actually sits in it. Position is
          anchored to weeks-to-exam, then advanced (never regressed) by the
          current-stage tap — same rule the routine's own phase uses.
          Deliberately does NOT show its own weeks/days-to-exam number — the
          header badge and the "Road to IIM" card each already show one, and
          three independently-rounded countdowns on one screen is exactly
          the "messy, inconsistent" complaint this would otherwise repeat. */}
      <div className="mb-4 pb-4 border-b border-stone-100">
        <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-2">Your CAT Roadmap</p>
        <div className="flex gap-1 mb-2">
          {roadmap.phases.map((p, i) => (
            <div
              key={p.id}
              className={cn(
                'h-1.5 flex-1 rounded-full',
                i < roadmap.currentIndex ? 'bg-orange-300'
                  : i === roadmap.currentIndex ? 'bg-orange-500'
                  : 'bg-stone-200'
              )}
            />
          ))}
        </div>
        {currentPhase && (
          <>
            <p className="text-sm font-bold text-stone-900">{currentPhase.label} <span className="font-normal text-stone-400">· {currentPhase.weekRange}</span></p>
            <p className="text-xs text-stone-500 mt-0.5">{currentPhase.objective}</p>
            <div className="mt-2 space-y-1">
              <p className="text-xs text-stone-600"><span className="font-semibold text-stone-500">Daily:</span> {currentPhase.dailyFocus}</p>
              <p className="text-xs text-stone-600"><span className="font-semibold text-stone-500">Weekly:</span> {currentPhase.weeklyFocus}</p>
            </div>
          </>
        )}
        <Link href="/student/blueprint" className="mt-3 inline-block text-xs font-semibold text-orange-600 hover:text-orange-700">
          View your full Study Blueprint →
        </Link>
      </div>

      {isCatchUp && !fullyDone && (
        <div className="mb-4 rounded-xl bg-teal-50 border border-teal-200 px-3.5 py-2.5">
          <p className="text-sm font-bold text-teal-900">Welcome back 👋</p>
          <p className="text-xs text-teal-700 mt-0.5">Ignore the gap — here&apos;s today&apos;s priority.</p>
        </div>
      )}

      <div className="flex items-center justify-between mb-1">
        <p className="text-xs uppercase tracking-widest text-orange-600 font-semibold">Today&apos;s Routine</p>
        {currentStreak > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-stone-500">
            <Flame className="w-3.5 h-3.5 text-orange-500" />{currentStreak}
          </span>
        )}
      </div>

      {fullyDone ? (
        <div className="py-6 text-center">
          <p className="text-lg font-bold text-stone-900">Today done. 🎉</p>
          <p className="text-sm text-stone-500 mt-1">Tomorrow&apos;s routine is ready.</p>
        </div>
      ) : (
        <>
          {/* Only rendered when there's an actual signal behind it (reasons
              non-empty) — a mission box that just repeats "today's routine"
              with nothing underneath is filler, not evidence. Every reason
              shown here is the same signal a buddy would see, nothing hidden
              behind a score the student can't inspect. */}
          {mission.reasons.length > 0 && (
            <div className="mb-3.5 rounded-xl border border-orange-200 bg-orange-50/70 px-3.5 py-3">
              <p className="text-[10px] uppercase tracking-widest text-orange-600 font-bold mb-1">Today&apos;s Mission</p>
              <p className="text-sm font-bold text-stone-900 mb-1.5">{mission.label}</p>
              <ul className="space-y-0.5">
                {mission.reasons.map((r) => (
                  <li key={r} className="text-xs text-orange-800 flex gap-1.5">
                    <span aria-hidden>✓</span><span>{r}</span>
                  </li>
                ))}
              </ul>
              {mission.id === 'mock-analysis' && (
                <p className="text-[11px] text-orange-700/80 mt-1.5">You can analyze it from today&apos;s log.</p>
              )}
            </div>
          )}

          {/* Answers "how did you plan this" up front — the same personalized
              output looks arbitrary if a student can't see what drove it. */}
          <p className="text-xs text-stone-400 mb-3">{whySummary}</p>

          {emergencyAcknowledged && (
            <div className="mb-3.5 rounded-xl bg-orange-50 border border-orange-200 px-3.5 py-2.5">
              <p className="text-sm font-bold text-orange-900">Minimum done for today ✓</p>
              <p className="text-xs text-orange-700 mt-0.5">Your streak is safe. Keep going below if you have more time.</p>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-sm text-stone-600 mb-4">
            <Clock className="w-4 h-4 text-stone-400" />
            <span>Est. {timeLabel}</span>
          </div>

          <div className="space-y-2">
            {tasks.map((task) => {
              const done = completedIds.has(task.id);
              // The priority task carries the one if-then implementation
              // intention (see routine-engine.ts) — given a step-by-step list
              // can't be "interactive" the way a coach is, vividness here is
              // the compensating lever, so it gets real visual weight, not
              // the same gray subtitle every other task gets.
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
                      <p className={cn('text-sm font-semibold', done ? 'text-teal-800 line-through' : 'text-stone-900')}>
                        {task.label}
                      </p>
                      {task.reason && !done && (
                        <p className={cn('text-xs mt-0.5', vivid ? 'font-semibold text-orange-700' : 'text-stone-500')}>
                          {task.reason}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs font-medium text-stone-400">{task.estMinutes}m</span>
                  </button>
                  {expanded && (
                    <div className="rounded-b-xl border border-t-0 border-orange-400 bg-orange-50/60 px-3 pb-3 pt-1">
                      <p className="text-xs font-semibold text-orange-800 mb-2">How did that go?</p>
                      <div className="flex gap-2">
                        {CONFIDENCE_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => toggleTask(task.id, opt.value)}
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

          <button
            onClick={() => setEmergencyMode((v) => !v)}
            className="mt-3.5 flex items-center gap-1.5 text-xs font-semibold text-orange-600 hover:text-orange-700"
          >
            <Zap className="w-3.5 h-3.5" />
            {emergencyMode ? 'Back to full routine' : 'Only have 20 minutes?'}
          </button>
        </>
      )}
    </Card>
  );
}
