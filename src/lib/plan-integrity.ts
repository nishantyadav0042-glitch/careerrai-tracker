import type { FullPlan } from './full-plan';
import { topicsInSection, SECTIONS } from './prep-model';

// ── The checklist door ──────────────────────────────────────────────────────
//
// Founder, 8 Aug: no study topic should be missed at all, because a student
// WILL check whether the plan covers everything — and how it was built. Every
// student's plan must pass the same gate: all 46 topics, mocks, revision, and
// daily hours matching what they told us. Coaching students additionally need
// every topic from their uploaded sheet to appear on the same date they gave
// us, so they can cross-check against the photo in their hand.
//
// WHY THIS IS NOT PARANOIA. Measured on the day it was written: at 3 hours a
// day the plan scheduled 28 of 46 topics and silently dropped eighteen —
// Mensuration, Probability, Coordinate Geometry and fifteen more simply never
// appeared. Not because of a bug in the scheduler: buildWeekPlan fills days to
// capacity and stops when the days run out, which is correct behaviour for a
// week view and catastrophic for a plan a student is told is complete.
//
// The fix is NOT to squeeze them in. There genuinely are not enough hours at
// 3h/day, and pretending otherwise is the lie this codebase keeps having to
// remove. The fix is that an unscheduled topic must be VISIBLE and NAMED,
// with the arithmetic that explains it. A student who can see "these 18 need
// 1.5 more hours a day" can act. A student shown 28 topics and told it is
// their full plan cannot.
//
// ── 11 Aug: where the shortfall moved ───────────────────────────────────────
//
// The planner is now one authority (plan-projection), and its syllabus clock
// reserves first-contact blocks structurally — so EVERY topic is opened at
// every commitment, 46/46, exactly as the founder required. A 3h student is
// still short of hours; they are just no longer short of CHAPTERS.
//
// That means the topics check above is now a regression guard rather than the
// place a real shortfall shows up, and the shortfall needed somewhere honest to
// live — otherwise this door would go all-green for a student 230 hours short.
// That is the `depth` check below. Coverage and depth are different promises,
// and the door now keeps them apart instead of collapsing them into one.

export type CheckStatus = 'pass' | 'fail' | 'warn' | 'na';

export interface IntegrityCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  /** Named items behind a failure, so the student sees exactly what is missing. */
  items?: string[];
}

export interface IntegrityReport {
  checks: IntegrityCheck[];
  passed: boolean;
  /** Topics with no place in the plan. Empty is the only good answer. */
  unscheduledTopics: string[];
}

export interface IntegrityInput {
  plan: FullPlan;
  /** The hours on the student's profile — what the plan must match. */
  committedHours: number | null;
  /** Coaching only: what their sheet says, by date. Undefined for self-prep. */
  coachingByDate?: Record<string, string[]>;
  /** Coaching plans stop at their month; a full-syllabus check would be unfair. */
  isCoachingMonth?: boolean;
}

const ALL_TOPICS = SECTIONS.flatMap((s) => topicsInSection(s));

export function checkPlanIntegrity(input: IntegrityInput): IntegrityReport {
  const { plan } = input;
  const checks: IntegrityCheck[] = [];

  const scheduled = new Set(
    plan.days.flatMap((d) => d.items.filter((i) => i.kind === 'topic').map((i) => i.label)),
  );
  const unscheduled = ALL_TOPICS.filter((t) => !scheduled.has(t));

  // ── 1. Every topic ────────────────────────────────────────────────────────
  if (input.isCoachingMonth) {
    // A one-month coaching plan is not supposed to contain the whole syllabus,
    // so asserting 46 topics against it would be a check designed to fail.
    checks.push({
      id: 'topics',
      label: 'Every CAT topic',
      status: 'na',
      detail: `This month covers ${scheduled.size} topics from your coaching. Your full syllabus is tracked separately.`,
    });
  } else if (unscheduled.length === 0) {
    checks.push({
      id: 'topics',
      label: 'Every CAT topic',
      status: 'pass',
      detail: `All ${ALL_TOPICS.length} topics are on your plan.`,
    });
  } else {
    const extraPerDay = plan.feasibility.committedPerDay != null
      ? Math.max(0.5, Math.round((plan.feasibility.requiredPerDay - plan.feasibility.committedPerDay) * 10) / 10)
      : null;
    checks.push({
      id: 'topics',
      label: 'Every CAT topic',
      status: 'fail',
      detail: extraPerDay != null
        ? `${unscheduled.length} of ${ALL_TOPICS.length} topics do not fit before CAT. About ${extraPerDay}h more a day would place them — or drop them deliberately.`
        : `${unscheduled.length} of ${ALL_TOPICS.length} topics do not fit. Set your study hours and we will tell you what it takes.`,
      items: unscheduled,
    });
  }

  // ── 1b. Depth: enough hours to actually finish each of them ───────────────
  //
  // Opening all 46 is the coverage promise. This is the other one: the hours
  // those 46 need at this student's own effort. Splitting them is what lets the
  // door say the true thing to a 3h student — "you will touch every chapter,
  // and you are 230h short of finishing them" — instead of either lie.
  const f = plan.feasibility;
  const shortfall = Math.max(0, f.syllabusHours - (f.topicCapacityHours ?? 0));
  if (input.isCoachingMonth) {
    checks.push({
      id: 'depth',
      label: 'Enough hours for each topic',
      status: 'na',
      detail: 'Your month plan is checked against your coaching sheet, not the full syllabus.',
    });
  } else if (f.committedPerDay == null) {
    checks.push({
      id: 'depth',
      label: 'Enough hours for each topic',
      status: 'warn',
      detail: 'You have not set your study hours yet, so we cannot check this.',
    });
  } else {
    checks.push({
      id: 'depth',
      label: 'Enough hours for each topic',
      status: shortfall === 0 ? 'pass' : 'fail',
      detail: shortfall === 0
        ? `Your ${f.topicDaysAvailable} free study days hold ${f.topicCapacityHours}h — enough for all ${ALL_TOPICS.length} topics at your pace.`
        : `Every topic is on your plan, but you are ${shortfall}h short of finishing them all. About ${f.requiredPerDay}h a day would clear it, against the ${f.committedPerDay}h you set.`,
    });
  }

  // ── 2. Mocks ──────────────────────────────────────────────────────────────
  const weeks = Math.max(1, plan.days.length / 7);
  const perWeek = Math.round((plan.mockCount / weeks) * 10) / 10;
  checks.push({
    id: 'mocks',
    label: 'A full mock every week',
    status: plan.mockCount === 0 ? 'fail' : perWeek >= 0.95 ? 'pass' : 'warn',
    detail: plan.mockCount === 0
      ? 'No mock is scheduled. That is a bug, not a plan.'
      : `${plan.mockCount} mocks — about ${perWeek} a week, rising to 2 a week from October.`,
  });

  // ── 3. Mock analysis ──────────────────────────────────────────────────────
  // Scheduled separately on purpose: every source in the research says the
  // analysis is where the improvement is, so a plan with mocks and no analysis
  // slots is only half a plan.
  const analysisDays = plan.days.filter((d) => d.items.some((i) => i.kind === 'mock_analysis')).length;
  checks.push({
    id: 'analysis',
    label: 'Time to analyse each mock',
    status: plan.mockCount === 0 ? 'na' : analysisDays >= plan.mockCount - 1 ? 'pass' : 'warn',
    detail: `${analysisDays} analysis blocks — one the day after each mock.`,
  });

  // ── 4. Revision ───────────────────────────────────────────────────────────
  const revisionDays = plan.days.filter((d) => d.items.some((i) => i.kind === 'revision')).length;
  checks.push({
    id: 'revision',
    label: 'Revision built in',
    status: revisionDays > 0 ? 'pass' : input.isCoachingMonth ? 'na' : 'fail',
    detail: revisionDays > 0
      ? `${revisionDays} revision days, and from 1 November no new topics are started.`
      : 'No revision days scheduled.',
  });

  // ── 5. Daily hours match what they told us ────────────────────────────────
  // The plan must never quietly schedule a different day than the student
  // agreed to. This is the check that would have caught the 6-hours-answered /
  // 30-minutes-planned contradiction on the morning it shipped.
  const studyDays = plan.days.filter((d) => d.items.some((i) => i.kind === 'topic' || i.kind === 'revision'));
  const overCommitted = input.committedHours != null
    ? studyDays.filter((d) => d.totalHours > input.committedHours! + 0.5).length
    : 0;
  checks.push({
    id: 'hours',
    label: 'Days match your study hours',
    status: input.committedHours == null ? 'warn' : overCommitted === 0 ? 'pass' : 'fail',
    detail: input.committedHours == null
      ? 'You have not set your study hours yet, so we cannot check this.'
      : overCommitted === 0
        ? `No day asks for more than your ${input.committedHours}h — mock days included.`
        : `${overCommitted} days ask for more than your ${input.committedHours}h.`,
  });

  // ── 6. Coaching: same topic, same date ────────────────────────────────────
  if (input.coachingByDate) {
    const missing: string[] = [];
    for (const [date, topics] of Object.entries(input.coachingByDate)) {
      const day = plan.days.find((d) => d.date === date);
      if (!day) continue; // outside the plan window — not a mismatch
      const onDay = new Set(day.items.map((i) => i.label));
      for (const t of topics) if (!onDay.has(t)) missing.push(`${date}: ${t}`);
    }
    checks.push({
      id: 'coaching_dates',
      label: 'Your class topics, on your class dates',
      status: missing.length === 0 ? 'pass' : 'fail',
      detail: missing.length === 0
        ? 'Every topic from your sheet is planned on the date your sheet gives.'
        : `${missing.length} topics are not on the date your coaching teaches them.`,
      items: missing.slice(0, 20),
    });
  }

  return {
    checks,
    // 'warn' does not fail the door — an unset hours figure is a gap in what we
    // know, not a broken plan. 'fail' does.
    passed: checks.every((c) => c.status !== 'fail'),
    unscheduledTopics: unscheduled,
  };
}
