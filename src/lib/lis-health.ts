import { computeCapacity } from '@/lib/capacity-engine';
import { dailyHours } from '@/lib/daily-hours';
import { computeAdaptation } from '@/lib/adaptation-engine';
import { assembleIntelligence, momentumProxy } from '@/lib/intelligence';
import { getPhase } from '@/lib/routine-engine';
import { weeksToExam } from '@/lib/study-plan';
import { daysSinceLastLog } from '@/lib/streak-utils';
import type { DecisionType } from '@/lib/coach-decision';
import type { ConstraintKey } from '@/lib/constraint-engine';
import type { Blocker } from '@/lib/mission-engine';

/* eslint-disable @typescript-eslint/no-explicit-any */

// LIS Health — the founder's readout that the Learning Intelligence System is
// actually working across the whole roster, not just on one 360 page. Every
// engine (Capacity → Adaptation → Constraint / Performance → Decision) is run
// for each active student off ONE batch of queries (not N per student), then
// aggregated into distributions: where Learning Velocity sits, which decision
// the engine is making for whom, how far Adaptation has drifted plans from their
// priced volume, and which bottleneck leads the roster. It reads identically at
// 87 students and at 5 million — same six queries, same aggregation.

const WINDOW_DAYS = 21;
const DAY = 86_400_000;

const DECISION_LABEL: Record<DecisionType, string> = {
  analyze_mock: 'Analyse your mock',
  revise_dont_learn: "Revise, don't learn",
  take_a_mock: 'Take a mock',
  recover: 'Recover / go light',
  rebuild_consistency: 'Rebuild consistency',
  push_ahead: 'Push ahead',
  follow_plan: 'Follow the plan',
};

const CONSTRAINT_LABEL: Record<ConstraintKey, string> = {
  consistency: 'Consistency', time: 'Time', knowledge: 'Syllabus coverage', revision: 'Revision',
  speed: 'Speed', mock_anxiety: 'Mock anxiety', discipline: 'Focus / discipline', accuracy: 'Accuracy',
};

export interface LisIntervention {
  id: string; name: string | null;
  decision: DecisionType; decisionLabel: string;
  velocity: number; topConstraint: string | null;
}

export interface LisHealth {
  totalStudents: number;
  cohortSize: number;                    // students with >=1 logged day in the window
  velocity: { avg: number; strong: number; building: number; low: number };
  direction: { accelerating: number; steady: number; stalling: number };
  confidence: { high: number; medium: number; low: number };
  decisions: { type: DecisionType; label: string; count: number }[];
  adaptation: { learning: number; trimmed: number; raised: number; avgTrim: number };
  capacityBehaviourCapped: number;
  constraints: { key: ConstraintKey; label: string; topCount: number }[];
  interventions: LisIntervention[];      // students the engine is actively steering off the default plan
}

function groupBy<T>(rows: T[] | null, key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows ?? []) {
    const k = key(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(r);
  }
  return m;
}

export async function getLisHealth(admin: any): Promise<LisHealth> {
  const now = Date.now();
  const todayStr = new Date(now).toISOString().slice(0, 10);
  const windowStart = new Date(now - WINDOW_DAYS * DAY).toISOString().slice(0, 10);
  const tenAgo = new Date(now - 10 * DAY).toISOString().slice(0, 10);
  const twentyAgo = new Date(now - 20 * DAY).toISOString().slice(0, 10);

  const [{ data: students }, { data: reports }, { data: routines }, { data: completions }, { data: coverage }, { data: debriefs }, { data: streaks }] = await Promise.all([
    admin.from('profiles')
      .select('id, full_name, study_target_hours, hours_available, baseline_varc, baseline_dilr, baseline_qa, target_percentile, biggest_blocker, attempt_year, current_stage, is_repeater, is_working_professional')
      .eq('role', 'student').not('is_test_account', 'is', true).not('is_demo', 'is', true),
    admin.from('daily_reports').select('student_id, report_date, study_duration, plan_fit, mock_taken').gte('report_date', windowStart),
    admin.from('daily_routines').select('student_id, routine_date, tasks').gte('routine_date', windowStart),
    admin.from('routine_task_completions').select('student_id, routine_date, task_id').gte('routine_date', windowStart),
    admin.from('topic_coverage').select('student_id, status'),
    admin.from('mock_debriefs').select('student_id, taken_on'),
    admin.from('streak_data').select('student_id, last_log_date'),
  ]);

  const reportsBy = groupBy(reports, (r: any) => r.student_id);
  const routinesBy = groupBy(routines, (r: any) => r.student_id);
  const completionsBy = groupBy(completions, (r: any) => r.student_id);
  const coverageBy = groupBy(coverage, (r: any) => r.student_id);
  const debriefsBy = groupBy(debriefs, (r: any) => r.student_id);
  const streakBy = new Map((streaks ?? []).map((s: any) => [s.student_id, s]));

  const h: LisHealth = {
    totalStudents: (students ?? []).length,
    cohortSize: 0,
    velocity: { avg: 0, strong: 0, building: 0, low: 0 },
    direction: { accelerating: 0, steady: 0, stalling: 0 },
    confidence: { high: 0, medium: 0, low: 0 },
    decisions: [],
    adaptation: { learning: 0, trimmed: 0, raised: 0, avgTrim: 0 },
    capacityBehaviourCapped: 0,
    constraints: [],
    interventions: [],
  };

  const decisionCount = new Map<DecisionType, number>();
  const constraintTop = new Map<ConstraintKey, number>();
  let velocitySum = 0;
  let trimSum = 0, trimN = 0;

  for (const p of students ?? []) {
    const rep = reportsBy.get(p.id) ?? [];
    if (rep.length === 0) continue; // engine has nothing to reason from yet
    h.cohortSize++;

    const hrs = rep.map((r: any) => Number(r.study_duration) || 0);
    const claimed = dailyHours(p).weekday;
    const capacity = computeCapacity(hrs, rep.length, claimed);
    if (capacity.trust === 'behaviour') h.capacityBehaviourCapped++;

    const rts = routinesBy.get(p.id) ?? [];
    const completedByDate = groupBy(completionsBy.get(p.id) ?? [], (c: any) => c.routine_date);
    const doneSet = (d: string) => new Set((completedByDate.get(d) ?? []).map((c: any) => c.task_id));

    let completedTasks = 0, plannedTasks = 0, planDays = 0;
    const daysSinceSection: Record<string, number> = {};
    for (const r of rts) {
      const tasks = Array.isArray(r.tasks) ? (r.tasks as any[]) : [];
      const done = doneSet(r.routine_date);
      if (r.routine_date < todayStr && tasks.length > 0) {
        planDays++; plannedTasks += tasks.length;
        completedTasks += Math.min(tasks.length, done.size);
      }
      const ago = Math.round((Date.parse(todayStr) - Date.parse(r.routine_date)) / DAY);
      for (const t of tasks) {
        if (!done.has(t.id)) continue;
        if (['VARC', 'DILR', 'QA'].includes(t.section) && (daysSinceSection[t.section] == null || ago < daysSinceSection[t.section])) daysSinceSection[t.section] = ago;
      }
    }
    const planFits = rep.map((r: any) => r.plan_fit).filter((f: any): f is string => typeof f === 'string');
    const adaptation = computeAdaptation(planFits, completedTasks, plannedTasks, planDays);
    if (adaptation.trust === 'learning') {
      h.adaptation.learning++;
      // Was "how much did we trim the plan"; the plan is no longer trimmed, so
      // this now counts what the behaviour SAYS about the load.
      if (adaptation.reading === 'heavy') {
        h.adaptation.trimmed++;
        if (adaptation.completionRatio != null) { trimSum += adaptation.completionRatio; trimN++; }
      } else if (adaptation.reading === 'light') h.adaptation.raised++;
    }

    // Direction windows + coverage + mock signals.
    let recentActive10 = 0, priorActive10 = 0;
    for (const r of rep) {
      if ((Number(r.study_duration) || 0) <= 0) continue;
      if (r.report_date > tenAgo) recentActive10++;
      else if (r.report_date > twentyAgo) priorActive10++;
    }
    const cov = coverageBy.get(p.id) ?? [];
    const coverageSnap = cov.length > 0
      ? { total: cov.length, notStarted: cov.filter((r: any) => r.status === 'not_started').length, confident: cov.filter((r: any) => r.status === 'exam_ready' || r.status === 'mastered').length }
      : null;
    const recencyVals = Object.values(daysSinceSection);
    const debriefDates = new Set((debriefsBy.get(p.id) ?? []).map((d: any) => d.taken_on));
    const lastMock = rep.find((r: any) => r.mock_taken === true);
    const daysSincePendingMock = lastMock && !debriefDates.has(lastMock.report_date)
      ? Math.round((Date.parse(todayStr) - Date.parse(lastMock.report_date)) / DAY) : null;
    const baselines = [p.baseline_varc, p.baseline_dilr, p.baseline_qa].map((v: any) => v as number | null).filter((v): v is number => v != null);
    const capacityGapHours = capacity.claimedHours != null && capacity.sustainableHours != null ? Math.max(0, Math.round((capacity.claimedHours - capacity.sustainableHours) * 2) / 2) : 0;
    const nowDate = new Date(now);
    const attemptYear = (p.attempt_year as number | null) ?? null;
    const gapDays = daysSinceLastLog((streakBy.get(p.id) as any)?.last_log_date);
    const activeDays21 = hrs.filter((x: number) => x > 0).length;

    const intel = assembleIntelligence({
      phase: getPhase(nowDate, attemptYear, (p.current_stage as any) ?? null, p.is_repeater === true),
      loggedDays: rep.length,
      activeDays21,
      recentActive10, priorActive10,
      capacityTrust: capacity.trust,
      capacityGapHours,
      completionRatio: adaptation.completionRatio,
      tooMuchRatio: adaptation.tooMuchRatio,
      momentumScore: momentumProxy(gapDays, activeDays21),
      coverage: coverageSnap,
      maxDaysSincePracticed: recencyVals.length ? Math.max(...recencyVals) : null,
      daysSincePendingMock,
      mocksTaken: rep.filter((r: any) => r.mock_taken === true).length,
      weakestBaseline: baselines.length ? Math.min(...baselines) : null,
      blocker: (p.biggest_blocker as Blocker | null) ?? null,
      targetPercentile: (p.target_percentile as number | null) ?? null,
      weeksToExam: weeksToExam(nowDate, attemptYear),
      gapDays,
    });

    const lv = intel.performance.learningVelocity;
    velocitySum += lv;
    if (lv >= 65) h.velocity.strong++; else if (lv >= 40) h.velocity.building++; else h.velocity.low++;
    h.direction[intel.performance.direction]++;
    h.confidence[intel.performance.projectedConfidence]++;
    decisionCount.set(intel.decision.type, (decisionCount.get(intel.decision.type) ?? 0) + 1);
    if (intel.constraints.top) constraintTop.set(intel.constraints.top.key, (constraintTop.get(intel.constraints.top.key) ?? 0) + 1);

    if (intel.decision.type !== 'follow_plan') {
      h.interventions.push({
        id: p.id, name: p.full_name ?? null,
        decision: intel.decision.type, decisionLabel: DECISION_LABEL[intel.decision.type],
        velocity: lv, topConstraint: intel.constraints.top?.label ?? null,
      });
    }
  }

  h.velocity.avg = h.cohortSize ? Math.round(velocitySum / h.cohortSize) : 0;
  h.adaptation.avgTrim = trimN ? Math.round((trimSum / trimN) * 100) / 100 : 0;
  h.decisions = (Object.keys(DECISION_LABEL) as DecisionType[])
    .map((type) => ({ type, label: DECISION_LABEL[type], count: decisionCount.get(type) ?? 0 }))
    .sort((a, b) => b.count - a.count);
  h.constraints = (Object.keys(CONSTRAINT_LABEL) as ConstraintKey[])
    .map((key) => ({ key, label: CONSTRAINT_LABEL[key], topCount: constraintTop.get(key) ?? 0 }))
    .filter((c) => c.topCount > 0)
    .sort((a, b) => b.topCount - a.topCount);
  // Most urgent interventions first (lowest velocity), capped for the page.
  h.interventions.sort((a, b) => a.velocity - b.velocity);
  h.interventions = h.interventions.slice(0, 40);

  return h;
}
