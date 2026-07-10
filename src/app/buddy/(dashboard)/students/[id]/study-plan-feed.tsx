import { createAdminClient } from '@/lib/supabase/admin';
import { ROADMAP_PHASES, currentRoadmapIndex, weeksToExam } from '@/lib/study-plan';
import { computeBlueprintConfidence } from '@/lib/prep-memory';
import { Card } from '@/components/ui/card';
import type { Stage } from '@/lib/routine-engine';
import { getStudentPrepSnapshot } from './prep-snapshot';

// Buddy read-only Study Plan feed (spec Phase 4). Profile + prep-memory come
// from the request-scoped snapshot shared with PreparationDNA (see
// prep-snapshot.ts) — this card used to re-run both for the same student in
// the same render. Read-only by construction — no mutation, no edit links;
// this shows the same facts the student's own Blueprint page shows, just
// from the buddy's side.
export async function StudyPlanFeed({ studentId }: { studentId: string }) {
  const admin = createAdminClient();

  const snapshot = await getStudentPrepSnapshot(studentId);
  if (!snapshot) return null;
  const { profile, prepMemory, weeklyEvolution, healthScore } = snapshot;

  const [{ data: coverage }, { data: streak }] = await Promise.all([
    admin.from('topic_coverage').select('status').eq('student_id', studentId),
    admin.from('streak_data').select('current_streak').eq('student_id', studentId).maybeSingle(),
  ]);

  const stage = profile.current_stage as Stage | null;
  const weeksRemaining = weeksToExam(new Date(), profile.attempt_year as number | null);
  const phase = ROADMAP_PHASES[currentRoadmapIndex(weeksRemaining, stage)];

  const coverageTally = { not_started: 0, learning: 0, practicing: 0, revising: 0, exam_ready: 0 };
  for (const row of coverage ?? []) {
    const status = row.status as keyof typeof coverageTally;
    coverageTally[status] = (coverageTally[status] ?? 0) + 1;
  }
  const coverageTotal = coverageTally.not_started + coverageTally.learning + coverageTally.practicing + coverageTally.revising + coverageTally.exam_ready;

  const blueprintConfidence = computeBlueprintConfidence({
    mockCount: prepMemory.mockTrend.count,
    coverageTotal,
    hasStage: stage != null,
    hasWeakTopic: (profile.self_reported_weak_topic as string | null) != null,
    daysStudiedLast30: prepMemory.last30.daysStudied,
  });

  const hasMemory = prepMemory.last30.tasksCompleted > 0;

  return (
    <Card className="p-5">
      <p className="text-xs font-bold uppercase tracking-wider text-stone-700 mb-3">Study plan (read-only)</p>

      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-bold text-stone-900">{phase.label} <span className="font-normal text-stone-400">· {weeksRemaining}w to CAT</span></p>
          <p className="text-xs text-stone-500 mt-0.5">{phase.objective}</p>
        </div>
        {streak?.current_streak ? (
          <span className="shrink-0 text-xs font-semibold text-orange-600">🔥 {streak.current_streak}d</span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-stone-100 pt-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold mb-1">Preparation health</p>
          {healthScore.status === 'provisional' ? (
            <p className="text-xs text-stone-400">Calculating — under a week of data</p>
          ) : (
            <p className="text-lg font-bold text-stone-900">{healthScore.score}<span className="text-xs text-stone-400 font-normal">/100</span></p>
          )}
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold mb-1">Blueprint confidence</p>
          <p className="text-lg font-bold text-stone-900">{blueprintConfidence.score}<span className="text-xs text-stone-400 font-normal">%</span></p>
        </div>
      </div>

      {coverageTotal > 0 && (
        <div className="grid grid-cols-5 gap-1 text-center border-t border-stone-100 mt-3 pt-3">
          {([
            ['⚪ New', coverageTally.not_started, 'text-stone-400'],
            ['🟡 Learning', coverageTally.learning, 'text-amber-600'],
            ['🔵 Practicing', coverageTally.practicing, 'text-blue-600'],
            ['🟠 Revising', coverageTally.revising, 'text-orange-600'],
            ['🟢 Ready', coverageTally.exam_ready, 'text-teal-600'],
          ] as const).map(([label, count, color]) => (
            <div key={label}>
              <p className={`text-sm font-bold ${color}`}>{count}</p>
              <p className="text-[9px] text-stone-400 leading-tight mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {hasMemory && (
        <p className="text-xs text-stone-600 border-t border-stone-100 mt-3 pt-3">
          <span className="font-semibold text-stone-500">Last 30 days:</span> {prepMemory.last30.daysStudied} days studied · {Math.round(prepMemory.last30.minutesStudied / 6) / 10}h
          {(prepMemory.last30.confidenceCounts.green + prepMemory.last30.confidenceCounts.yellow + prepMemory.last30.confidenceCounts.red) > 0 && (
            <> · 🟢{prepMemory.last30.confidenceCounts.green} 🟡{prepMemory.last30.confidenceCounts.yellow} 🔴{prepMemory.last30.confidenceCounts.red}</>
          )}
        </p>
      )}

      {weeklyEvolution.length > 0 && (
        <p className="text-xs text-stone-600 border-t border-stone-100 mt-3 pt-3">
          <span className="font-semibold text-stone-500">This week: </span>{weeklyEvolution[0]}
        </p>
      )}

      {blueprintConfidence.reasons.length > 0 && (
        <ul className="mt-3 border-t border-stone-100 pt-3 space-y-1">
          {blueprintConfidence.reasons.map((r) => (
            <li key={r} className="text-[11px] text-stone-400 leading-snug">{r}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}
