'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Check, Clock, Zap, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RoutineTask {
  id: string;
  section: string;
  label: string;
  estMinutes: number;
  reason: string | null;
}

interface RoutineResponse {
  routine: { phase: string; tasks: RoutineTask[]; est_minutes: number };
  completions: { task_id: string; is_emergency: boolean }[];
  currentStreak: number;
  isCatchUp: boolean;
}

export function TodaysRoutineCard() {
  const [data, setData] = useState<RoutineResponse | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [emergencyMode, setEmergencyMode] = useState(false);
  const [dayClosed, setDayClosed] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/routine/today');
      if (!res.ok) return;
      const json = (await res.json()) as RoutineResponse;
      setData(json);
      setCompletedIds(new Set(json.completions.map((c) => c.task_id)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleTask(taskId: string) {
    if (busyTaskId) return;
    setBusyTaskId(taskId);
    try {
      const res = await fetch('/api/routine/complete-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId, is_emergency: emergencyMode }),
      });
      if (!res.ok) return;
      const json = (await res.json()) as { completedTaskIds: string[]; fullyDone: boolean; emergencyMinimumDone: boolean };
      setCompletedIds(new Set(json.completedTaskIds));
      if (json.fullyDone || json.emergencyMinimumDone) setDayClosed(true);
    } finally {
      setBusyTaskId(null);
    }
  }

  if (loading) {
    return (
      <Card className="p-5 animate-pulse">
        <div className="h-4 w-32 bg-stone-200 rounded mb-3" />
        <div className="h-16 bg-stone-100 rounded" />
      </Card>
    );
  }
  if (!data) return null;

  const { routine, currentStreak, isCatchUp } = data;
  const tasks = emergencyMode ? routine.tasks.slice(0, 1) : routine.tasks;
  const totalMinutes = emergencyMode ? tasks[0]?.estMinutes ?? 0 : routine.est_minutes;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const timeLabel = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  return (
    <Card className="p-5">
      {isCatchUp && !dayClosed && (
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

      {dayClosed ? (
        <div className="py-6 text-center">
          <p className="text-lg font-bold text-stone-900">Today done. 🎉</p>
          <p className="text-sm text-stone-500 mt-1">Tomorrow&apos;s routine is ready.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1.5 text-sm text-stone-600 mb-4">
            <Clock className="w-4 h-4 text-stone-400" />
            <span>Est. {timeLabel}</span>
          </div>

          <div className="space-y-2">
            {tasks.map((task) => {
              const done = completedIds.has(task.id);
              return (
                <button
                  key={task.id}
                  onClick={() => toggleTask(task.id)}
                  disabled={busyTaskId === task.id}
                  className={cn(
                    'w-full flex items-start gap-3 rounded-xl border p-3 text-left transition-all active:scale-[0.99]',
                    done ? 'border-teal-200 bg-teal-50' : 'border-stone-200 bg-white hover:border-stone-300'
                  )}
                >
                  <span className={cn(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                    done ? 'border-teal-600 bg-teal-600' : 'border-stone-300'
                  )}>
                    {done && <Check className="w-3 h-3 text-white" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-sm font-semibold', done ? 'text-teal-800 line-through' : 'text-stone-900')}>
                      {task.label}
                    </p>
                    {task.reason && !done && (
                      <p className="text-xs text-stone-500 mt-0.5">{task.reason}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs font-medium text-stone-400">{task.estMinutes}m</span>
                </button>
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
