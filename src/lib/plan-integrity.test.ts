import { describe, it, expect } from 'vitest';
import { checkPlanIntegrity } from './plan-integrity';
import { buildFullPlan } from './full-plan';
import { studentEffortMultiplier } from './study-pace';
import { topicsInSection, SECTIONS } from './prep-model';

const ALL = SECTIONS.flatMap((s) => topicsInSection(s));
const UNTOUCHED = ALL.map((topic) => ({ topic, status: 'not_started' }));
const TODAY = new Date('2026-08-08T00:00:00Z');

const planAt = (hours: number | null, over: Partial<Parameters<typeof buildFullPlan>[0]> = {}) =>
  buildFullPlan({
    coverage: UNTOUCHED, effort: 1, weekdayHours: hours, today: TODAY, attemptYear: 2026,
    revisionDue: ['Percentages'], ...over,
  });

// Founder, 8 Aug: no study topic should be missed at all — a student WILL
// check whether the plan covers everything. Measured the day this was written:
// at 3h/day the plan scheduled 28 of 46 topics and silently dropped eighteen.

describe('the topic check catches what was actually happening', () => {
  // 11 Aug — WHAT CHANGED, and why this test now asserts the opposite.
  //
  // It used to assert that 3h/day left 18 chapters off the plan entirely, and
  // that was the correct assertion for the planner of the day: buildWeekPlan
  // filled days to capacity and stopped when the days ran out. The founder's
  // ruling ended that — "all forty-six of the forty-six topics must be covered
  // for every student, according to their timetable" — and the syllabus clock
  // in plan-projection now reserves first contact structurally, so a 3h student
  // opens all 46 too.
  //
  // The shortfall did not vanish; it moved to where it was always true. A 3h
  // student is short of HOURS, not of chapters, and the door says so.
  it('3h a day still opens all 46 — and the door names the hours it costs', () => {
    const r = checkPlanIntegrity({ plan: planAt(3), committedHours: 3 });
    expect(r.unscheduledTopics).toEqual([]);
    expect(r.checks.find((c) => c.id === 'topics')!.status).toBe('pass');

    const depth = r.checks.find((c) => c.id === 'depth')!;
    expect(depth.status).toBe('fail');
    expect(depth.detail).toMatch(/Every topic is on your plan/);
    expect(depth.detail).toMatch(/h short of finishing/);
    expect(depth.detail).toMatch(/against the 3h you set/);
    // The door must still fail overall. A student 230h short who is shown all
    // green has been told the most expensive lie in the product.
    expect(r.passed).toBe(false);
  });

  it('6h a day covers all 46 and passes', () => {
    const r = checkPlanIntegrity({ plan: planAt(6), committedHours: 6 });
    expect(r.unscheduledTopics).toEqual([]);
    expect(r.checks.find((c) => c.id === 'topics')!.status).toBe('pass');
    expect(r.checks.find((c) => c.id === 'topics')!.detail).toContain('46');
  });

  it('a strong repeater passes at 4h where a first-timer fails', () => {
    const fresher = checkPlanIntegrity({ plan: planAt(4), committedHours: 4 });
    const repeater = checkPlanIntegrity({
      plan: planAt(4, { effort: studentEffortMultiplier({ isRepeater: true, lastYearPercentile: 88 }) }),
      committedHours: 4,
    });
    // Both see every chapter — coverage is no longer what separates them.
    expect(fresher.unscheduledTopics).toEqual([]);
    expect(repeater.unscheduledTopics).toEqual([]);
    // DEPTH is. The repeater's syllabus is priced lower, so 4h genuinely holds
    // it; the first-timer's does not, and that is the whole reason effort is a
    // per-student number rather than a printed constant.
    expect(fresher.checks.find((c) => c.id === 'depth')!.status).toBe('fail');
    expect(repeater.checks.find((c) => c.id === 'depth')!.status).toBe('pass');
    expect(repeater.passed).toBe(true);
  });

  it('a coaching month is not judged against the whole syllabus', () => {
    // A one-month plan is not supposed to contain 46 topics, so asserting it
    // would be a check designed to fail.
    const r = checkPlanIntegrity({
      plan: planAt(4, { horizonDays: 31 }), committedHours: 4, isCoachingMonth: true,
    });
    expect(r.checks.find((c) => c.id === 'topics')!.status).toBe('na');
  });
});

describe('mocks, analysis and revision are all checked', () => {
  const r = checkPlanIntegrity({ plan: planAt(6), committedHours: 6 });

  it('a mock every week', () => {
    const c = r.checks.find((x) => x.id === 'mocks')!;
    expect(c.status).toBe('pass');
    expect(c.detail).toMatch(/a week/);
  });

  it('an analysis block for each mock', () => {
    expect(r.checks.find((x) => x.id === 'analysis')!.status).toBe('pass');
  });

  it('revision is present and the November rule is stated', () => {
    const c = r.checks.find((x) => x.id === 'revision')!;
    expect(c.status).toBe('pass');
    expect(c.detail).toContain('no new topics');
  });
});

describe('the hours check would have caught this morning\'s contradiction', () => {
  it('passes when no day exceeds what the student agreed to', () => {
    const r = checkPlanIntegrity({ plan: planAt(6), committedHours: 6 });
    expect(r.checks.find((c) => c.id === 'hours')!.status).toBe('pass');
  });

  it('fails when the plan schedules more than they said they have', () => {
    // A plan built for 8h, checked against a profile that says 3h. This is the
    // shape of the 6-hours-answered / 30-minutes-planned bug, in reverse.
    const r = checkPlanIntegrity({ plan: planAt(8), committedHours: 3 });
    const c = r.checks.find((x) => x.id === 'hours')!;
    expect(c.status).toBe('fail');
    expect(c.detail).toMatch(/ask for more than your 3h/);
  });

  it('warns rather than fails when hours were never set', () => {
    const r = checkPlanIntegrity({ plan: planAt(null), committedHours: null });
    expect(r.checks.find((c) => c.id === 'hours')!.status).toBe('warn');
    // A gap in what we know is not a broken plan.
    expect(r.checks.find((c) => c.id === 'hours')!.status).not.toBe('fail');
  });
});

describe('coaching: same topic, same date, so a student can cross-check the photo', () => {
  it('passes when every sheet topic lands on its own date', () => {
    const plan = planAt(6, { horizonDays: 31 });
    // Take what the plan actually put on two days and assert it back — this is
    // the shape of a matching sheet.
    const day = plan.days.find((d) => d.items.some((i) => i.kind === 'topic'))!;
    const topic = day.items.find((i) => i.kind === 'topic')!.label;
    const r = checkPlanIntegrity({
      plan, committedHours: 6, isCoachingMonth: true,
      coachingByDate: { [day.date]: [topic] },
    });
    expect(r.checks.find((c) => c.id === 'coaching_dates')!.status).toBe('pass');
  });

  it('fails, and says which date and which topic, when it does not', () => {
    const plan = planAt(6, { horizonDays: 31 });
    const r = checkPlanIntegrity({
      plan, committedHours: 6, isCoachingMonth: true,
      coachingByDate: { '2026-08-12': ['Mensuration'], '2026-08-13': ['Probability'] },
    });
    const c = r.checks.find((x) => x.id === 'coaching_dates')!;
    expect(c.status).toBe('fail');
    expect(c.items!.some((i) => i.includes('2026-08-12'))).toBe(true);
    expect(r.passed).toBe(false);
  });

  it('a sheet date outside the plan window is not counted as a mismatch', () => {
    const plan = planAt(6, { horizonDays: 31 });
    const r = checkPlanIntegrity({
      plan, committedHours: 6, isCoachingMonth: true,
      coachingByDate: { '2027-01-01': ['Mensuration'] },
    });
    expect(r.checks.find((c) => c.id === 'coaching_dates')!.status).toBe('pass');
  });
});
