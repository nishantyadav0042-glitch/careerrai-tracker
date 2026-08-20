import { describe, it, expect } from 'vitest';
import { buildDayPlan, hoursForStudyDay, toRoutineProfile, type DayPlanInput } from './plan-day';
import { TOPICS_BY_SECTION } from './day-topics';

// ── WHOLE-PLAN EQUIVALENCE ──────────────────────────────────────────────────
//
// Founder, 14 Aug: "For identical student state, all study plan generation
// paths must produce the same canonical plan. Not just the same weakest
// section — the whole plan. Always identical."
//
// The two writers now share one assembly (lib/plan-day), so equivalence is
// structural: there is nothing left to disagree about. What still has to be
// proved is that the assembly itself is a FUNCTION of the state — same inputs,
// same plan, every time, regardless of when or how often it is called.
//
// That is the property the cron relies on: it runs in the evening, the student
// opens the app in the morning, and both must land on the same day.

const SECTIONS = ['VARC', 'DILR', 'QA'] as const;

function stateFor(over: Partial<{
  hours: number; weakest: string; coverageSeed: number; planSource: string;
  targetDate: string | null; today: string; repeater: boolean; wp: boolean;
}> = {}): DayPlanInput {
  const hours = over.hours ?? 8;
  const today = over.today ?? '2026-08-20';
  let seed = over.coverageSeed ?? 3;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

  const statuses = ['not_started', 'learning', 'revising', 'exam_ready'];
  const coverageRows = SECTIONS.flatMap((s) =>
    TOPICS_BY_SECTION[s].map((topic) => ({
      section: s, topic, status: statuses[Math.floor(rnd() * statuses.length)], is_priority: rnd() < 0.1,
    })));

  const daysSinceLastPracticedByTopic: Record<string, number | null> = {};
  const daysSincePlannedByTopic: Record<string, number | null> = {};
  for (const r of coverageRows) {
    const v = rnd() < 0.4 ? null : Math.floor(rnd() * 25);
    daysSinceLastPracticedByTopic[r.topic] = v;
    daysSincePlannedByTopic[r.topic] = v;
  }

  return {
    profile: {
      is_working_professional: over.wp ?? false,
      is_repeater: over.repeater ?? false,
      target_percentile: 95,
      hours_available: hours,
      study_target_hours: String(hours),
      weekend_hours_available: hours,
      syllabus_target_date: over.targetDate === undefined ? '2026-10-15' : over.targetDate,
      self_reported_weakest_section: over.weakest ?? 'DILR',
      self_reported_strongest_section: 'QA',
      self_reported_weak_topic: null,
      baseline_varc: null, baseline_dilr: null, baseline_qa: null,
      attempt_year: 2026, current_stage: null, start_with: null,
      plan_source: over.planSource ?? 'careerrai',
    },
    coverageRows,
    debriefRows: [],
    timetableRow: null,
    history: {
      recentTopics: [], daysSinceLastPracticedByTopic, daysSincePlannedByTopic,
      timesPracticedByTopic: {}, postponedTopics: [], yesterday: null,
      yesterdayUnfinishedTopics: [], completedTasks: 0, plannedTasks: 0, planDays: 5,
      daysSinceLastPracticed: { VARC: null, DILR: null, QA: null },
    } as unknown as DayPlanInput['history'],
    today,
    now: new Date(`${today}T09:00:00Z`),
  };
}

/** Everything a student can see about their day, in one comparable string. */
const canonical = (r: ReturnType<typeof buildDayPlan>) => JSON.stringify({
  phase: r.phase,
  estMinutes: r.estMinutes,
  hoursToday: r.hoursToday,
  weakest: r.focus.weakest,
  strongest: r.focus.strongest,
  fromTimetable: r.fromTimetable,
  tasks: r.tasks.map((t) => ({
    id: t.id, section: t.section, topic: t.topic, label: t.label,
    target: t.target, estMinutes: t.estMinutes, reason: t.reason,
  })),
});

describe('identical state produces an identical plan', () => {
  it('two independent builds of the same state agree byte for byte', () => {
    // This is the invariant the notification cron and the tracker route both
    // depend on: the evening build and the morning read must be the same day.
    for (let seed = 1; seed <= 40; seed++) {
      const a = buildDayPlan(stateFor({ coverageSeed: seed }));
      const b = buildDayPlan(stateFor({ coverageSeed: seed }));
      expect(canonical(a), `seed ${seed}`).toBe(canonical(b));
    }
  });

  it('agrees across every archetype, budget and weak section', () => {
    for (const hours of [1, 2, 4, 6, 8, 11, 14]) {
      for (const weakest of SECTIONS) {
        for (const over of [{}, { repeater: true }, { wp: true }, { repeater: true, wp: true }]) {
          const s = { hours, weakest, coverageSeed: 11, ...over };
          expect(canonical(buildDayPlan(stateFor(s))), JSON.stringify(s))
            .toBe(canonical(buildDayPlan(stateFor(s))));
        }
      }
    }
  });

  it('agrees with no finish date set, and on a weekend', () => {
    for (const s of [
      { targetDate: null },
      { today: '2026-08-22' }, // Saturday
      { today: '2026-08-23' }, // Sunday
    ]) {
      expect(canonical(buildDayPlan(stateFor(s))), JSON.stringify(s))
        .toBe(canonical(buildDayPlan(stateFor(s))));
    }
  });

  it('the wall-clock TIME of the call cannot change the day', () => {
    // The cron builds at 21:30 IST; the student opens at 07:00. Same day.
    const base = stateFor({ coverageSeed: 9 });
    const evening = buildDayPlan({ ...base, now: new Date(`${base.today}T16:00:00Z`) });
    const morning = buildDayPlan({ ...base, now: new Date(`${base.today}T01:30:00Z`) });
    expect(canonical(evening)).toBe(canonical(morning));
  });
});

describe('the day is sized from the study day, not the host clock', () => {
  it('weekend hours apply on the study day that is a weekend', () => {
    const weekday = hoursForStudyDay(
      { weekdayHours: 3, weekendHours: 9, isWorkingProfessional: false } as never, '2026-08-20');
    const saturday = hoursForStudyDay(
      { weekdayHours: 3, weekendHours: 9, isWorkingProfessional: false } as never, '2026-08-22');
    expect(weekday).toBe(3);
    expect(saturday).toBe(9);
  });

  it('falls back to stated defaults rather than zero when hours are unset', () => {
    const fresher = hoursForStudyDay(
      { weekdayHours: null, weekendHours: null, isWorkingProfessional: false } as never, '2026-08-20');
    const wp = hoursForStudyDay(
      { weekdayHours: null, weekendHours: null, isWorkingProfessional: true } as never, '2026-08-20');
    expect(fresher).toBe(2.5);
    expect(wp).toBe(1.5);
  });
});

describe('the profile mapping happens once, and reads the student\'s own hours', () => {
  it('takes hours through lib/daily-hours, never from the finish date', () => {
    const p = toRoutineProfile(
      { study_target_hours: '7', weekend_hours_available: 9, is_repeater: true, attempt_year: 2026 },
      { weakest: 'QA', weakestSource: 'self_report', strongest: 'VARC', mockBasis: null, mockTakenOn: null },
    );
    expect(p.weekdayHours).toBe(7);
    expect(p.weekendHours).toBe(9);
    expect(p.weakestSection).toBe('QA');
    expect(p.strongestSection).toBe('VARC');
    expect(p.isRepeater).toBe(true);
  });
});

describe('an uploaded timetable owns the day, identically every time', () => {
  const blocks = [
    { day: 0, date: '2026-08-20', dayIndex: null, start: null, end: null, allDay: true,
      section: 'QA', topic: 'Percentages', label: '3 hrs: Percentages', minutes: 180 },
    { day: 0, date: '2026-08-20', dayIndex: null, start: null, end: null, allDay: true,
      section: 'VARC', topic: 'Reading Comprehension', label: '2 hrs: RC', minutes: 120 },
    { day: 0, date: '2026-08-21', dayIndex: null, start: null, end: null, allDay: true,
      section: 'DILR', topic: 'Arrangements', label: '2 hrs: Arrangements', minutes: 120 },
  ];

  const withSheet = (): DayPlanInput => ({
    ...stateFor({ planSource: 'coaching' }),
    timetableRow: { blocks, confirmed_at: '2026-08-19T00:00:00Z' },
  });

  it('is flagged as the sheet\'s day, and repeats exactly', () => {
    const a = buildDayPlan(withSheet());
    const b = buildDayPlan(withSheet());
    expect(a.fromTimetable).toBe(true);
    expect(canonical(a)).toBe(canonical(b));
    expect(a.tasks.map((t) => t.topic)).toEqual(['Percentages', 'Reading Comprehension']);
    expect(a.estMinutes).toBe(300);
  });

  it('the engine never runs on a day the sheet owns', () => {
    // If it did, the coverage matrix could append the block that started this
    // whole thread.
    const a = buildDayPlan(withSheet());
    expect(a.tasks).toHaveLength(2);
    expect(a.todayClassTopics).toEqual([]);
  });
});
