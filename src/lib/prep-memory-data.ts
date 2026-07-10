// Preparation Memory's DB-facing wiring — shared by /api/blueprint and the
// student homepage (/student/tracker) so both read the identical join and
// window logic instead of two copies drifting apart.

import { archetypeRevisionMultiplier, type Section } from './routine-engine';
import { getLogDateString } from './streak-utils';
import { TOPIC_METADATA } from './topics-constants';
import {
  windowStats, mockTrend, weeklyEvolutionLines,
  consistencyBreakdown, sectionGapDays, revisionDueStats, computeHealthScore,
  buildTopicMemory,
  type CompletionRecord, type WindowStats, type MockTrend, type HealthScore, type TopicMemoryEntry,
} from './prep-memory';
import { computeMomentum, computeRisk, detectSignals, type StudentState, type Signal } from './signal-engine';

function addDays(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().split('T')[0];
}

interface RoutineTaskShape { id: string; section: Section | 'General'; topic: string | null; estMinutes: number }

export interface CoverageRowInput { topic: string; status: string; updated_at: string }

// Optional prefetched inputs so a caller that needs BOTH computePrepMemory
// and computeTopicMemory (i.e. /api/blueprint) can fetch topic_coverage and
// the completion history ONCE and share them — those two used to be fetched
// 3× and 2× respectively in a single blueprint request. Callers that pass
// nothing get the exact same internal queries as before.
export interface PrefetchedPrepInputs {
  coverageRows?: CoverageRowInput[];
  completionRecords?: CompletionRecord[]; // full-history records; windows filter down internally
}

// Cross-references routine_task_completions (which only stores task_id +
// routine_date) back to the section/topic/estMinutes each task actually
// was, by matching against the daily_routines row for that same date — the
// same join pattern buildHistory() in /api/routine/today already uses.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildCompletionRecords(admin: any, studentId: string, sinceDate: string): Promise<CompletionRecord[]> {
  const [{ data: routines }, { data: completions }] = await Promise.all([
    admin.from('daily_routines').select('routine_date, tasks').eq('student_id', studentId).gte('routine_date', sinceDate),
    admin.from('routine_task_completions').select('routine_date, task_id, confidence, is_emergency').eq('student_id', studentId).gte('routine_date', sinceDate),
  ]);

  const tasksByDate = new Map<string, RoutineTaskShape[]>();
  for (const r of (routines ?? [])) tasksByDate.set(r.routine_date, r.tasks as RoutineTaskShape[]);

  const records: CompletionRecord[] = [];
  for (const c of (completions ?? [])) {
    const task = tasksByDate.get(c.routine_date)?.find((t) => t.id === c.task_id);
    if (!task) continue; // completion outlived its routine row — shouldn't happen, but skip rather than fabricate
    records.push({
      routineDate: c.routine_date,
      section: task.section,
      topic: task.topic,
      estMinutes: task.estMinutes,
      confidence: (c.confidence as CompletionRecord['confidence']) ?? null,
      isEmergency: !!c.is_emergency,
    });
  }
  return records;
}

export interface PrepMemoryResult {
  prepMemory: { last30: WindowStats; last7: WindowStats; mockTrend: MockTrend };
  weeklyEvolution: string[];
  healthScore: HealthScore;
  studentState: StudentState;
  signals: Signal[];
  revisionDueCount: number;
}

// Single entry point for both /api/blueprint and the tracker homepage —
// same data, same windows, same arithmetic, no second definition to drift.
// archetype/signupDate feed Preparation Health's window length (rolling 30
// days or since signup, whichever is shorter) and revision-due cadence (the
// same per-archetype multiplier the Topic Selector and Mission Engine use).
export async function computePrepMemory(
  admin: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  studentId: string,
  archetype: { isRepeater: boolean; isWorkingProfessional: boolean },
  signupDate: string | null,
  prefetched?: PrefetchedPrepInputs
): Promise<PrepMemoryResult> {
  const today = getLogDateString();
  const last30Start = addDays(today, -29);
  const last7Start = addDays(today, -6);
  const priorWeekStart = addDays(today, -13);
  const priorWeekEnd = addDays(today, -7);
  const week1Start = addDays(today, -20);
  const week1End = addDays(today, -14);

  const [completionRecordsRaw, { data: debriefs }, { data: coverageRows }] = await Promise.all([
    prefetched?.completionRecords != null
      ? Promise.resolve(prefetched.completionRecords)
      : buildCompletionRecords(admin, studentId, last30Start),
    admin.from('mock_debriefs').select('taken_on, overall_percentile').eq('student_id', studentId).gte('taken_on', last30Start).order('taken_on', { ascending: false }),
    prefetched?.coverageRows != null
      ? Promise.resolve({ data: prefetched.coverageRows })
      : admin.from('topic_coverage').select('topic, status, updated_at').eq('student_id', studentId),
  ]);
  // Prefetched records may span full history — filter down to the same
  // 30-day window the internal query would have applied. Identical rows in
  // either path.
  const completionRecords = prefetched?.completionRecords != null
    ? completionRecordsRaw.filter((r) => r.routineDate >= last30Start)
    : completionRecordsRaw;

  const mockDates = (debriefs ?? []).map((d: { taken_on: string }) => d.taken_on);
  const last30 = windowStats(completionRecords, mockDates, last30Start, today);
  const last7 = windowStats(completionRecords, mockDates, last7Start, today);
  const priorWeek = windowStats(completionRecords, mockDates, priorWeekStart, priorWeekEnd);
  const week1 = windowStats(completionRecords, mockDates, week1Start, week1End);

  const daysSinceSignup = signupDate ? Math.round((Date.parse(today) - Date.parse(signupDate)) / 86_400_000) : 30;
  const windowDaysElapsed = Math.max(1, Math.min(30, daysSinceSignup));
  const windowStart = addDays(today, -(windowDaysElapsed - 1));
  const { daysWithCompletion, daysEmergencyOnly } = consistencyBreakdown(completionRecords, windowStart, today);
  const healthWindow = windowStats(completionRecords, mockDates, windowStart, today);
  const gaps = sectionGapDays(completionRecords, today);
  const revisionMultiplier = archetypeRevisionMultiplier(archetype);
  const { due, completed } = revisionDueStats(
    (coverageRows ?? []).map((r: { topic: string; status: string; updated_at: string }) => ({ topic: r.topic, status: r.status, updatedAt: r.updated_at })),
    completionRecords,
    today,
    revisionMultiplier,
    windowStart
  );

  const trend = mockTrend((debriefs ?? []).map((d: { overall_percentile: number | null }) => ({ overallPercentile: d.overall_percentile })));

  // Student State V1 — see signal-engine.ts for why only these four fields.
  const inMotionTopics = new Set(
    (coverageRows ?? []).filter((r: { status: string }) => r.status !== 'not_started').map((r: { topic: string }) => r.topic)
  ).size;
  const totalTopics = Object.keys(TOPIC_METADATA).length;
  const lastActivityDate = completionRecords.length
    ? [...completionRecords].map((c) => c.routineDate).sort().at(-1)!
    : null;
  const daysSinceLastActivity = lastActivityDate
    ? Math.round((Date.parse(today) - Date.parse(lastActivityDate)) / 86_400_000)
    : null;
  const emergencyRatio = last30.daysStudied > 0 ? last30.emergencyDays / last30.daysStudied : 0;

  const studentState: StudentState = {
    knowledge: Math.round((inMotionTopics / totalTopics) * 100),
    consistency: Math.round((last30.daysStudied / 30) * 100),
    momentum: computeMomentum([week1.minutesStudied, priorWeek.minutesStudied, last7.minutesStudied]),
    risk: computeRisk({
      daysSinceLastActivity,
      priorConsistencyDays: last30.daysStudied,
      mockLatestPercentile: trend.latestPercentile,
      mockPreviousPercentile: trend.previousPercentile,
      emergencyRatio,
    }),
  };

  const qaVarcDilrTasks = last30.sectionCounts.VARC + last30.sectionCounts.DILR + last30.sectionCounts.QA;
  const signals = detectSignals({
    sectionGapDays: gaps,
    sectionShare: qaVarcDilrTasks > 0
      ? { VARC: last30.sectionCounts.VARC / qaVarcDilrTasks, DILR: last30.sectionCounts.DILR / qaVarcDilrTasks, QA: last30.sectionCounts.QA / qaVarcDilrTasks }
      : {},
    emergencyRatio,
    revisionDue: due,
    revisionCompletedThisWeek: completed,
  });

  return {
    prepMemory: { last30, last7, mockTrend: trend },
    weeklyEvolution: weeklyEvolutionLines(last7, priorWeek),
    healthScore: computeHealthScore({
      windowDaysElapsed,
      daysWithCompletion,
      daysEmergencyOnly,
      confidenceCounts: healthWindow.confidenceCounts,
      sectionGaps: gaps,
      revisionDue: due,
      revisionCompleted: completed,
    }),
    studentState,
    signals,
    revisionDueCount: due,
  };
}

// Blueprint Memory — "did I / when did I," over the student's FULL history,
// not the rolling 30-day window everything else in this file uses. A
// separate query on purpose: "first studied 54 days ago" needs to look
// further back than Preparation Health ever does.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function computeTopicMemory(admin: any, studentId: string, archetype: { isRepeater: boolean; isWorkingProfessional: boolean }, prefetched?: PrefetchedPrepInputs): Promise<TopicMemoryEntry[]> {
  const today = getLogDateString();
  const [allCompletions, { data: coverageRows }] = await Promise.all([
    prefetched?.completionRecords != null
      ? Promise.resolve(prefetched.completionRecords)
      : buildCompletionRecords(admin, studentId, '2000-01-01'),
    prefetched?.coverageRows != null
      ? Promise.resolve({ data: prefetched.coverageRows })
      : admin.from('topic_coverage').select('topic, status, updated_at').eq('student_id', studentId),
  ]);

  return buildTopicMemory(
    Object.keys(TOPIC_METADATA),
    allCompletions,
    (coverageRows ?? []).map((r: { topic: string; status: string; updated_at: string }) => ({ topic: r.topic, status: r.status, updatedAt: r.updated_at })),
    today,
    archetypeRevisionMultiplier(archetype)
  );
}
