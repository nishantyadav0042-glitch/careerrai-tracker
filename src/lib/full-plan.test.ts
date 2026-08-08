import { describe, it, expect } from 'vitest';
import {
  buildFullPlan, phaseOn, isMockDay, mocksForWeekOf, feasibilityLine,
  MOCKS_PER_WEEK, MOCK_ANALYSIS_HOURS,
} from './full-plan';
import { studentEffortMultiplier, totalSyllabusHours } from './study-pace';
import { topicsInSection, SECTIONS } from './prep-model';
import { catExamDate } from './routine-engine';

const ALL = SECTIONS.flatMap((s) => topicsInSection(s));
const UNTOUCHED = ALL.map((topic) => ({ topic, status: 'not_started' }));
const TODAY = new Date('2026-08-08T00:00:00Z');
const EXAM = catExamDate(2026); // Sunday 29 November 2026

// The research is in docs/SELFPREP-PLAN-RESEARCH-2026-08.md. These tests pin
// the two things the founder decided on top of it: one mock a week as the
// floor, two a week from October (not three), and an impossible date stated
// plainly rather than engineered away.

describe('phases follow the exam calendar, not a preference', () => {
  it('build now, intensive in September and October, revision in November', () => {
    expect(phaseOn(new Date('2026-08-08T00:00:00Z'), EXAM)).toBe('build');
    expect(phaseOn(new Date('2026-09-15T00:00:00Z'), EXAM)).toBe('intensive');
    expect(phaseOn(new Date('2026-10-31T00:00:00Z'), EXAM)).toBe('intensive');
    expect(phaseOn(new Date('2026-11-01T00:00:00Z'), EXAM)).toBe('revision');
    expect(phaseOn(new Date('2026-11-28T00:00:00Z'), EXAM)).toBe('revision');
  });
});

describe('the mock calendar', () => {
  it('one a week now — the floor, not the ambition', () => {
    expect(MOCKS_PER_WEEK.build).toBe(1);
    expect(mocksForWeekOf(new Date('2026-08-12T00:00:00Z'), EXAM)).toBe(1);
  });

  it('TWO a week in October and November, not three', () => {
    // Founder, 8 Aug: three a week leaves no room to act on what the analysis
    // found. The research suggested three for November; this is the deliberate
    // departure from it, and it is recorded here so it is not "corrected" later.
    expect(MOCKS_PER_WEEK.intensive).toBe(2);
    expect(mocksForWeekOf(new Date('2026-10-14T00:00:00Z'), EXAM)).toBe(2);
    expect(mocksForWeekOf(new Date('2026-11-14T00:00:00Z'), EXAM)).toBe(2);
  });

  it('Sunday always; Wednesday too once the ramp starts', () => {
    // Sunday: a full mock needs an unbroken two hours. Wednesday for the
    // second, so one mock's analysis is done before the next begins.
    expect(isMockDay(new Date('2026-08-09T00:00:00Z'), EXAM)).toBe(true);  // Sun, build
    expect(isMockDay(new Date('2026-08-12T00:00:00Z'), EXAM)).toBe(false); // Wed, build
    expect(isMockDay(new Date('2026-10-11T00:00:00Z'), EXAM)).toBe(true);  // Sun, intensive
    expect(isMockDay(new Date('2026-10-14T00:00:00Z'), EXAM)).toBe(true);  // Wed, intensive
  });

  it('never schedules a mock after the exam', () => {
    expect(isMockDay(new Date('2026-12-06T00:00:00Z'), EXAM)).toBe(false);
  });

  it('lands in the 20-40 band the research says is the minimum', () => {
    const plan = buildFullPlan({
      coverage: UNTOUCHED, effort: 1, weekdayHours: 5, today: TODAY, attemptYear: 2026,
    });
    expect(plan.mockCount).toBeGreaterThanOrEqual(20);
    expect(plan.mockCount).toBeLessThanOrEqual(40);
  });

  it('every mock gets its analysis block the NEXT day', () => {
    // The single highest-value finding in the research: analysis beats volume,
    // and an unscheduled 2-hour job does not happen.
    const plan = buildFullPlan({
      coverage: UNTOUCHED, effort: 1, weekdayHours: 5, today: TODAY, attemptYear: 2026,
    });
    const mockDates = plan.days.filter((d) => d.isMockDay).map((d) => d.date);
    for (const md of mockDates.slice(0, -1)) { // the last mock's analysis may fall past the exam
      const next = new Date(Date.parse(md + 'T00:00:00Z') + 86_400_000).toISOString().slice(0, 10);
      const day = plan.days.find((d) => d.date === next);
      if (!day) continue;
      const analysis = day.items.find((i) => i.kind === 'mock_analysis');
      expect(analysis, `no analysis block on ${next} after mock on ${md}`).toBeDefined();
      expect(analysis!.hours).toBe(MOCK_ANALYSIS_HOURS);
    }
  });
});

describe('the plan runs to CAT day and obeys the phase rules', () => {
  const plan = buildFullPlan({
    coverage: UNTOUCHED, effort: 1, weekdayHours: 5, today: TODAY, attemptYear: 2026,
    revisionDue: ['Percentages', 'Reading Comprehension'],
  });

  it('starts today and ends at the exam, with no gaps', () => {
    expect(plan.days[0].date).toBe('2026-08-08');
    expect(plan.examDate).toBe('2026-11-29');
    for (let i = 1; i < plan.days.length; i++) {
      const gap = Date.parse(plan.days[i].date) - Date.parse(plan.days[i - 1].date);
      expect(gap).toBe(86_400_000);
    }
  });

  it('NO NEW TOPICS from 1 November — the one rule every source states', () => {
    const november = plan.days.filter((d) => d.date >= '2026-11-01');
    expect(november.length).toBeGreaterThan(20);
    for (const d of november) {
      expect(d.items.some((i) => i.kind === 'topic'), `new topic on ${d.date}`).toBe(false);
    }
  });

  it('November is revision, mocks and analysis — and never empty', () => {
    for (const d of plan.days.filter((x) => x.date >= '2026-11-01')) {
      expect(d.items.length).toBeGreaterThan(0);
      expect(d.items.every((i) => ['revision', 'mock', 'mock_analysis'].includes(i.kind))).toBe(true);
    }
  });

  it('a coaching student can cap the horizon at their uploaded month', () => {
    const month = buildFullPlan({
      coverage: UNTOUCHED, effort: 1, weekdayHours: 5, today: TODAY, attemptYear: 2026,
      horizonDays: 31,
    });
    expect(month.days).toHaveLength(31);
    expect(month.days[30].date).toBe('2026-09-07');
  });
});

describe('feasibility is computed, and said out loud', () => {
  const at = (h: number | null) => buildFullPlan({
    coverage: UNTOUCHED, effort: 1, weekdayHours: h, today: TODAY, attemptYear: 2026,
  }).feasibility;

  it('counts the mock hours into the total — a verdict without them is a lie', () => {
    const f = at(5);
    expect(f.syllabusHours).toBe(totalSyllabusHours());
    expect(f.mockHours).toBeGreaterThan(80);
    expect(f.totalHours).toBe(f.syllabusHours + f.mockHours);
  });

  it('4h a day does NOT fit, and the numbers are the SAME ones the calendar uses', () => {
    // Feasibility is measured against the days topics can actually use — not
    // the raw calendar. The first version divided total work by every day to
    // the exam, counting mock days, analysis days and November as free, and so
    // reported "4.5h a day is enough" while the scheduler quietly dropped
    // eighteen topics. The verdict and the calendar now answer with one number.
    const f = at(4);
    expect(f.fits).toBe(false);
    expect(f.daysOver).toBeGreaterThan(0);
    expect(f.topicCapacityHours!).toBeLessThan(f.syllabusHours);
    const line = feasibilityLine(f);
    expect(line).toContain('run out of days');
    expect(line).toContain('fewer topics');
    expect(line).toContain(`${f.topicDaysAvailable} free study days`);
  });

  it('6h a day fits, and the capacity genuinely holds the syllabus', () => {
    const f = at(6);
    expect(f.fits).toBe(true);
    expect(f.topicCapacityHours!).toBeGreaterThanOrEqual(f.syllabusHours);
    expect(feasibilityLine(f)).toContain('fits');
  });

  it('THE INVARIANT: fits === every topic actually scheduled', () => {
    // The whole point of the checklist door. If these two ever disagree, the
    // plan is either promising a syllabus it will not schedule, or hiding one
    // it could have.
    for (const h of [4, 6, 8, 10]) {
      const plan = buildFullPlan({
        coverage: UNTOUCHED, effort: 1, weekdayHours: h, today: TODAY, attemptYear: 2026,
      });
      const scheduled = new Set(
        plan.days.flatMap((d) => d.items.filter((i) => i.kind === 'topic').map((i) => i.label)),
      );
      expect(scheduled.size === ALL.length, `${h}h: fits=${plan.feasibility.fits} but ${scheduled.size}/${ALL.length} scheduled`)
        .toBe(plan.feasibility.fits);
    }
  });

  it('a strong repeater fits at 4h where a first-timer does not', () => {
    // The whole reason the verdict is computed per student rather than printed.
    const repeater = buildFullPlan({
      coverage: UNTOUCHED,
      effort: studentEffortMultiplier({ isRepeater: true, lastYearPercentile: 88 }),
      weekdayHours: 4, today: TODAY, attemptYear: 2026,
    }).feasibility;
    expect(at(4).fits).toBe(false);
    expect(repeater.fits).toBe(true);
    expect(repeater.syllabusHours).toBeLessThan(at(4).syllabusHours);
  });

  it('says something useful even when hours are unknown', () => {
    const f = at(null);
    expect(f.committedPerDay).toBeNull();
    expect(feasibilityLine(f)).toContain('Set your study hours');
  });
});
