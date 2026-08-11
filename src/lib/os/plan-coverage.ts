// ── Plan Coverage: is this student's plan actually teaching the syllabus? ────
//
// Founder, 11 Aug, after Abhishek: "I don't want you to repeat this blunder
// with our core product. Build this report in the admin panel — how many
// topics you covered in their study plan, and for how many hours."
//
// The blunder was invisible for eighteen days because nothing in the product
// ever counted DISTINCT topics. Every dashboard counted logs, streaks, hours
// and tasks-completed — all of which looked healthy while the same five topics
// were served over and over. A student could be perfectly consistent, tick
// every box, and still be shown 13 topics out of 53.
//
// So this counts the one thing that was never counted. It is deliberately an
// EXCEPTION surface, in the house style: a healthy plan produces no row.

/** A single planned task, as stored in daily_routines.tasks. */
export interface PlannedSlot {
  routineDate: string;
  topic: string | null;
  minutes?: number | null;
}

export interface PlanCoverageInput {
  studentId: string;
  name: string;
  slots: PlannedSlot[];
  /** Topics in the student's syllabus that are still 'not_started'. */
  neverOpened: number;
  /** Total topics mapped for this student. */
  totalTopics: number;
  daysToTarget: number | null;
}

export type PlanCoverageVerdict = 'healthy' | 'repeating' | 'starved' | 'too_early';

export interface PlanCoverageRow {
  studentId: string;
  name: string;
  planDays: number;
  distinctTopics: number;
  totalSlots: number;
  /** Hours the plan has actually asked for, from task minutes. */
  plannedHours: number;
  worstTopic: string | null;
  worstCount: number;
  /** Share of all slots spent on the single most-repeated topic (0–100). */
  concentration: number;
  neverOpened: number;
  totalTopics: number;
  daysToTarget: number | null;
  verdict: PlanCoverageVerdict;
  reason: string;
}

/**
 * A plan needs a few days before "only 3 topics" means anything — on day one
 * three topics IS the whole plan. Below this, we say too_early rather than
 * inventing a problem. Measured: of ~215 students, most had 1–2 plan days, and
 * counting them as broken would have buried the 20 who really were.
 */
export const MIN_DAYS_TO_JUDGE = 5;

/** One topic eating this share of a student's plan is the loop, not emphasis. */
export const CONCENTRATION_LIMIT = 25;

/** Fewer than this many distinct topics per plan-day is a starved rotation. */
export const TOPICS_PER_DAY_FLOOR = 0.75;

export function assessPlanCoverage(input: PlanCoverageInput): PlanCoverageRow {
  const withTopic = input.slots.filter((s) => s.topic);
  const days = new Set(withTopic.map((s) => s.routineDate)).size;
  const counts = new Map<string, number>();
  for (const s of withTopic) counts.set(s.topic!, (counts.get(s.topic!) ?? 0) + 1);

  let worstTopic: string | null = null;
  let worstCount = 0;
  for (const [topic, n] of counts) if (n > worstCount) { worstTopic = topic; worstCount = n; }

  const totalSlots = withTopic.length;
  const distinctTopics = counts.size;
  const concentration = totalSlots ? Math.round((worstCount / totalSlots) * 100) : 0;
  const plannedHours = Math.round(
    (input.slots.reduce((m, s) => m + (s.minutes ?? 0), 0) / 60) * 10
  ) / 10;

  const base = {
    studentId: input.studentId, name: input.name,
    planDays: days, distinctTopics, totalSlots, plannedHours,
    worstTopic, worstCount, concentration,
    neverOpened: input.neverOpened, totalTopics: input.totalTopics,
    daysToTarget: input.daysToTarget,
  };

  if (days < MIN_DAYS_TO_JUDGE) {
    return { ...base, verdict: 'too_early', reason: `Only ${days} day${days === 1 ? '' : 's'} of plans — too early to judge.` };
  }

  // The loop, in the exact shape it took for Abhishek and nineteen others.
  if (concentration > CONCENTRATION_LIMIT) {
    return {
      ...base,
      verdict: 'repeating',
      reason: `${worstTopic} served ${worstCount}× — ${concentration}% of every task this student has been given.`,
    };
  }

  if (days > 0 && distinctTopics / days < TOPICS_PER_DAY_FLOOR) {
    return {
      ...base,
      verdict: 'starved',
      reason: `${distinctTopics} topics across ${days} days — the plan is cycling a small rotation.`,
    };
  }

  return {
    ...base,
    verdict: 'healthy',
    reason: `${distinctTopics} topics across ${days} days, nothing over ${concentration}%.`,
  };
}

/** Exceptions first: broken plans, worst concentration on top. Healthy ones drop out. */
export function planCoverageExceptions(rows: PlanCoverageRow[]): PlanCoverageRow[] {
  return rows
    .filter((r) => r.verdict === 'repeating' || r.verdict === 'starved')
    .sort((a, b) => b.concentration - a.concentration || b.worstCount - a.worstCount);
}
