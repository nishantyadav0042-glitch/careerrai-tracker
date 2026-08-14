import { describe, it, expect } from 'vitest';
import { generateRoutine, type RoutineProfile } from './routine-engine';
import { buildTopicChoices, TOPICS_BY_SECTION } from './day-topics';
import { TOPIC_METADATA } from './topics-constants';

// ── CAN EVERY TOPIC ACTUALLY BE REACHED? ────────────────────────────────────
//
// Founder, 14 Aug, choosing option (a): "those students who have more than six
// hours should complete all the topics — otherwise topics as per weightage and
// coverage matrix... and if the date is too close, tell them the date doesn't
// work."
//
// Counting 46 rows in a constant proves nothing. A topic can exist, be valid,
// be in the coverage grid, and still never be selected by the planner — and
// nothing would error. The student simply walks into CAT never having seen it.
//
// So this simulates the REAL pipeline day by day — buildTopicChoices into
// generateRoutine, with the day's tasks fed back as completed coverage, the
// way a student actually moves — and reports which topics were reached.

const SECTIONS = ['VARC', 'DILR', 'QA'] as const;
type Section = (typeof SECTIONS)[number];

const ALL_TOPICS = SECTIONS.flatMap((s) => TOPICS_BY_SECTION[s].map((t) => ({ section: s, topic: t })));

interface SimResult {
  reached: Set<string>;
  never: { section: string; topic: string }[];
  servedCount: Record<string, number>;
  daysWithOneSectionOnly: number;
  totalDays: number;
}

/**
 * One student, `days` days, the real engine.
 *
 * Coverage advances the way it does in production: a topic that appears on a
 * day moves not_started → learning → revising. That feedback is what makes the
 * simulation meaningful — a selector that always returns its favourite topic
 * looks fine for one day and starves the syllabus over sixty.
 */
function simulate(opts: {
  hours: number;
  days: number;
  weakest?: Section;
  isRepeater?: boolean;
  isWorkingProfessional?: boolean;
  startDate?: string;
}): SimResult {
  const { hours, days } = opts;
  const status = new Map<string, string>();
  const lastPlanned = new Map<string, number>();
  const timesPracticed = new Map<string, number>();
  const reached = new Set<string>();
  const servedCount: Record<string, number> = {};
  let daysWithOneSectionOnly = 0;

  const start = Date.parse(opts.startDate ?? '2026-08-15T06:00:00Z');

  for (let day = 0; day < days; day++) {
    const now = new Date(start + day * 86_400_000);
    const profile = {
      isWorkingProfessional: opts.isWorkingProfessional ?? false,
      isRepeater: opts.isRepeater ?? false,
      targetPercentile: 95,
      weekdayHours: hours,
      weekendHours: hours,
      weakestSection: opts.weakest ?? 'DILR',
      strongestSection: 'QA',
      weakTopic: null,
      currentStage: null,
      attemptYear: 2026,
    } as RoutineProfile;

    const coverage = ALL_TOPICS.map(({ section, topic }) => ({
      topic, section, status: status.get(topic) ?? 'not_started', is_priority: false,
    }));

    const daysSinceLastPracticedByTopic: Record<string, number | null> = {};
    const daysSincePlannedByTopic: Record<string, number | null> = {};
    const timesPracticedByTopic: Record<string, number> = {};
    for (const { topic } of ALL_TOPICS) {
      const seen = lastPlanned.get(topic);
      const gap = seen == null ? null : day - seen;
      daysSinceLastPracticedByTopic[topic] = gap;
      daysSincePlannedByTopic[topic] = gap;
      timesPracticedByTopic[topic] = timesPracticed.get(topic) ?? 0;
    }

    const history = {
      recentTopics: [], daysSinceLastPracticedByTopic, daysSincePlannedByTopic,
      timesPracticedByTopic, postponedTopics: [], yesterday: null,
      yesterdayUnfinishedTopics: [], completedTasks: 0, plannedTasks: 0, planDays: day,
      daysSinceLastPracticed: { VARC: null, DILR: null, QA: null },
    } as unknown as Parameters<typeof buildTopicChoices>[2];

    const daysToTarget = days - day;
    const tc = buildTopicChoices(coverage, profile, history, null, [], daysToTarget, now);
    const routine = generateRoutine(
      profile, now, history as unknown as Parameters<typeof generateRoutine>[2], tc.choices, tc.extras,
    );

    const sectionsToday = new Set<string>();
    for (const task of routine.tasks) {
      if (!task.topic) continue;
      sectionsToday.add(task.section);
      reached.add(task.topic);
      servedCount[task.topic] = (servedCount[task.topic] ?? 0) + 1;
      lastPlanned.set(task.topic, day);
      timesPracticed.set(task.topic, (timesPracticed.get(task.topic) ?? 0) + 1);
      const cur = status.get(task.topic) ?? 'not_started';
      status.set(task.topic, cur === 'not_started' ? 'learning' : cur === 'learning' ? 'revising' : 'revising');
    }
    if (sectionsToday.size === 1) daysWithOneSectionOnly++;
  }

  return {
    reached,
    never: ALL_TOPICS.filter(({ topic }) => !reached.has(topic)),
    servedCount,
    daysWithOneSectionOnly,
    totalDays: days,
  };
}

describe('the canonical syllabus is well-formed', () => {
  it('is 46 topics — 9 VARC, 9 DILR, 28 QA — with no duplicates', () => {
    expect(ALL_TOPICS).toHaveLength(46);
    expect(TOPICS_BY_SECTION.VARC).toHaveLength(9);
    expect(TOPICS_BY_SECTION.DILR).toHaveLength(9);
    expect(TOPICS_BY_SECTION.QA).toHaveLength(28);
    const names = ALL_TOPICS.map((t) => t.topic);
    expect(new Set(names).size, 'duplicate topic name').toBe(names.length);
  });

  it('every topic carries the weightage the planner ranks it by', () => {
    // A topic with no metadata is not "unweighted" — it is invisible to the
    // ranking that decides what a sub-6-hour student gets. That is the exact
    // silent-starvation shape this gate exists to catch.
    for (const { topic } of ALL_TOPICS) {
      const meta = TOPIC_METADATA[topic];
      expect(meta, `${topic} has no metadata`).toBeTruthy();
      expect(typeof meta.weightage, `${topic} weightage`).toBe('number');
      expect(meta.weightage).toBeGreaterThan(0);
    }
  });
});

describe('OPTION (a) — a 6h+ student reaches every topic before their date', () => {
  // Founder's rule. Above six hours there is no "we prioritised" excuse: the
  // student bought the time, the syllabus has to be delivered.
  const CASES: { label: string; hours: number; days: number }[] = [
    { label: '6h, 60 days', hours: 6, days: 60 },
    { label: '7h, 60 days', hours: 7, days: 60 },
    { label: '8h, 45 days', hours: 8, days: 45 },
    { label: '10h, 40 days', hours: 10, days: 40 },
    { label: '12h, 35 days', hours: 12, days: 35 },
  ];

  for (const c of CASES) {
    it(`${c.label} — all 46 opened, none left behind`, () => {
      const r = simulate({ hours: c.hours, days: c.days });
      expect(
        r.never.map((n) => `${n.section}:${n.topic}`),
        `${c.label} left topics unopened`,
      ).toEqual([]);
      expect(r.reached.size).toBe(46);
    });
  }

  it('holds whichever section is weakest', () => {
    for (const weakest of SECTIONS) {
      const r = simulate({ hours: 8, days: 50, weakest });
      expect(r.never.map((n) => n.topic), `weakest=${weakest}`).toEqual([]);
    }
  });

  it('holds for a repeater and for a working professional', () => {
    for (const over of [{ isRepeater: true }, { isWorkingProfessional: true }]) {
      const r = simulate({ hours: 8, days: 55, ...over });
      expect(r.never.map((n) => n.topic), JSON.stringify(over)).toEqual([]);
    }
  });
});

describe('BELOW 6 hours — weightage decides, and nothing is silently equal', () => {
  // Founder: "otherwise topics as per weightage and coverage matrix." A short
  // day cannot deliver 46 topics honestly, so what matters is that the ones it
  // DOES deliver are the ones worth the most marks — not an arbitrary subset.
  it('a 2-hour student still opens the highest-weightage topics first', () => {
    const r = simulate({ hours: 2, days: 30 });
    const byWeight = [...ALL_TOPICS].sort(
      (a, b) => (TOPIC_METADATA[b.topic]?.weightage ?? 0) - (TOPIC_METADATA[a.topic]?.weightage ?? 0),
    );
    const topTen = byWeight.slice(0, 10).map((t) => t.topic);
    const hit = topTen.filter((t) => r.reached.has(t)).length;
    // Not all ten — a 2-hour day is genuinely small and revision competes.
    // But the heavy end of the syllabus must clearly be where the time went.
    expect(hit, `only ${hit}/10 of the heaviest topics reached`).toBeGreaterThanOrEqual(7);
  });

  it('a short day is never spent entirely on one section', () => {
    // The founder's repeat rule, applied to the smallest budgets where it is
    // most likely to break.
    const r = simulate({ hours: 2, days: 30 });
    expect(r.daysWithOneSectionOnly, 'days spent on a single section').toBe(0);
  });
});

describe('no topic is starved and none is over-served', () => {
  it('no topic takes more than 3x its section\'s fair share', () => {
    // NOT an absolute cap. The founder wants weightage to drive the plan —
    // "focus on weightage, revision, and mocks" — so Reading Comprehension
    // recurring far more than Odd One Out is the engine working, not hogging.
    // What must not happen is one topic eating a section's calendar. Measured
    // against the section's own average, which is the only fair yardstick when
    // VARC has 9 topics and QA has 28.
    const r = simulate({ hours: 8, days: 60 });
    for (const section of SECTIONS) {
      const topics = TOPICS_BY_SECTION[section];
      const served = topics.map((t) => r.servedCount[t] ?? 0);
      const avg = served.reduce((a, b) => a + b, 0) / topics.length;
      const hogs = topics
        .map((t, i) => ({ t, n: served[i] }))
        .filter((x) => x.n > avg * 3);
      expect(hogs, `${section} hogged: ${JSON.stringify(hogs)} (avg ${avg.toFixed(1)})`).toEqual([]);
    }
  });

  it('every reached topic is served at least twice over a long horizon', () => {
    // Opened once and never revisited is not "covered" — it is a topic the
    // student saw in week one and forgot by CAT.
    const r = simulate({ hours: 8, days: 60 });
    const onceOnly = Object.entries(r.servedCount).filter(([, n]) => n < 2).map(([t]) => t);
    expect(onceOnly, `served only once in 60 days: ${JSON.stringify(onceOnly)}`).toEqual([]);
  });
});
