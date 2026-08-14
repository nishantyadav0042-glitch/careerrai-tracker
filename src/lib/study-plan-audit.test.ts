import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateRoutine, type RoutineProfile, type Section } from './routine-engine';
import { buildTopicChoices } from './day-topics';
import { applyConfidenceSignal, type CoverageStatus } from './topic-selector';
import { remainingSyllabusHours } from './study-pace';
import { totalSyllabusHours, topicsInSection } from './prep-model';
import { TOPIC_METADATA } from './topics-constants';

// ── THE SYLLABUS-COMPLETION AUDIT ───────────────────────────────────────────
//
// Founder audit, 8 Aug 2026: "if a student follows CareerRai every day, do
// they finish the syllabus by their target date?"
//
// REWRITTEN 14 Aug, and the reason matters more than the rewrite.
//
// This file used to carry a local `buildChoices` function, labelled in its own
// comment as an exact reproduction of buildTopicChoices. It stopped being one
// on 11 Aug, when the real selector gained the two-clock split — the syllabus
// clock that reserves first-contact blocks, `newTopicPressure`,
// `daysSincePlanned`. The clone kept none of them.
//
// So its assertions ("teaches 13 of 46 topics", "276 hours still outstanding",
// "caps VARC at two topics in a year") described the PRE-unification engine.
// They passed because the clone reproduced the old behaviour faithfully, not
// because production did. The file was certifying a bug that had already been
// fixed, and — the part that actually matters — it could no longer fail when
// the real planner regressed. A test that cannot fail is worse than no test:
// it occupies the space where a real check would go.
//
// It now drives the REAL pipeline (buildTopicChoices → generateRoutine) and
// asserts what is true today. Reachability itself is proved exhaustively in
// topic-reachability.gate.test.ts across every budget and archetype; what
// stays HERE is the arithmetic that file does not cover — the completion
// ceiling, the confidence ladder, and the closer's carve-out.

const SECTIONS: Section[] = ['VARC', 'DILR', 'QA'];
const TOPICS_BY_SECTION: Record<Section, string[]> = {
  VARC: topicsInSection('VARC'), DILR: topicsInSection('DILR'), QA: topicsInSection('QA'),
};
const ALL_TOPICS = Object.keys(TOPIC_METADATA);

interface SimState { coverage: Map<string, CoverageStatus>; lastPracticed: Map<string, number> }

const NO_HISTORY = { daysSinceLastPracticed: { VARC: null, DILR: null, QA: null } };

/**
 * A student who opens the app every day and marks every task fully done —
 * driven through the SAME buildTopicChoices the two plan writers call.
 */
function simulate(profile: RoutineProfile, days: number, start = new Date('2026-08-08T06:00:00Z')) {
  const state: SimState = { coverage: new Map(), lastPracticed: new Map() };
  const touched = new Set<string>();
  const picksBySection: Record<string, string[]> = { VARC: [], DILR: [], QA: [] };

  for (let day = 0; day < days; day++) {
    const date = new Date(start.getTime() + day * 86_400_000);

    const coverageRows = SECTIONS.flatMap((section) =>
      TOPICS_BY_SECTION[section].map((topic) => ({
        section, topic,
        status: state.coverage.get(topic) ?? 'not_started',
        is_priority: false,
      })));

    const daysSinceLastPracticedByTopic: Record<string, number | null> = {};
    const daysSincePlannedByTopic: Record<string, number | null> = {};
    for (const topic of ALL_TOPICS) {
      const last = state.lastPracticed.get(topic);
      const gap = last == null ? null : day - last;
      daysSinceLastPracticedByTopic[topic] = gap;
      daysSincePlannedByTopic[topic] = gap;
    }

    const history = {
      ...NO_HISTORY,
      daysSinceLastPracticedByTopic, daysSincePlannedByTopic,
      timesPracticedByTopic: {}, postponedTopics: [], recentTopics: [],
      yesterday: null, yesterdayUnfinishedTopics: [],
      completedTasks: 0, plannedTasks: 0, planDays: day,
    } as unknown as Parameters<typeof buildTopicChoices>[2];

    // The student's own finish date drives the syllabus clock — the input the
    // old clone had no concept of.
    const daysToTarget = days - day;
    const choices = buildTopicChoices(coverageRows, profile, history, null, [], daysToTarget, date);
    const routine = generateRoutine(
      profile, date, history as unknown as Parameters<typeof generateRoutine>[2],
      choices.choices, choices.extras,
    );

    for (const t of routine.tasks) {
      if (!t.topic) continue;
      touched.add(t.topic);
      picksBySection[t.section as string]?.push(t.topic);
      state.lastPracticed.set(t.topic, day);
      state.coverage.set(t.topic, applyConfidenceSignal(state.coverage.get(t.topic) ?? null, 'green'));
    }
  }

  const rows = [...state.coverage.entries()].map(([topic, status]) => ({ topic, status }));
  return { state, touched, picksBySection, remaining: remainingSyllabusHours(rows, 1) };
}

const beginner = (over: Partial<RoutineProfile> = {}): RoutineProfile => ({
  isWorkingProfessional: false, isRepeater: false, targetPercentile: 95,
  weekdayHours: 8, weekendHours: 8, weakestSection: 'QA', strongestSection: 'VARC',
  weakTopic: null, currentStage: 'not_started', attemptYear: 2026,
  ...over,
});

describe('the audit drives the real planner, not a copy of it', () => {
  it('imports buildTopicChoices instead of re-implementing it', () => {
    // The guard that would have caught the drift this file was rewritten for.
    // If someone re-adds a local reproduction of the selector, this fails on
    // the same day rather than three engine changes later.
    //
    // The banned phrase is ASSEMBLED rather than written: a literal here would
    // be found in this very file and the check could never pass — the
    // self-quoting trap that has bitten several guards in this repo.
    const src = readFileSync('src/lib/study-plan-audit.test.ts', 'utf8');
    expect(src).toContain("from './day-topics'");
    expect(src).toContain('buildTopicChoices(coverageRows,');
    const bannedLabel = ['faithful', 'copy'].join(' ');
    expect(src.toLowerCase()).not.toContain(bannedLabel);
    // No hand-rolled scorer either — the coverage-points table lives in
    // topic-selector and nowhere else. Assembled for the same reason as above.
    const bannedTable = `const ${'COVER'}: Record<string, number>`;
    expect(src).not.toContain(bannedTable);
  });
});

describe('AUDIT: does following the plan finish the syllabus?', () => {
  // The old version of this block asserted 13 of 46 and "loops forever".
  // That was the pre-two-clock engine. The syllabus clock now reserves
  // first-contact blocks against the student's own date, so a perfect year
  // opens the whole syllabus.
  it('a perfect year opens every topic, not a fraction of them', () => {
    const { touched } = simulate(beginner(), 365);
    expect(touched.size).toBe(ALL_TOPICS.length);
  });

  it('a finished syllabus leaves only the revision ceiling outstanding', () => {
    // Every topic reached and tapped green three times tops out at 'revising'
    // — see the completion-ceiling block below for why that is not zero.
    const { remaining } = simulate(beginner(), 365);
    expect(remaining).toBeLessThan(totalSyllabusHours() * 0.25);
  });

  it('more hours now buys more syllabus — the 8x-effort bug is gone', () => {
    // THE most damaging fact in the original audit was that a 1.5h student and
    // a 12h student reached identical topics: hours changed how much work each
    // task held but not which topics advanced. Over a short horizon where the
    // budget genuinely binds, that must no longer hold.
    const lowTime = simulate(beginner({ weekdayHours: 1.5, weekendHours: 1.5 }), 21);
    const aggressive = simulate(beginner({ weekdayHours: 12, weekendHours: 12 }), 21);
    expect(aggressive.touched.size).toBeGreaterThan(lowTime.touched.size);
  });

  it('no section is capped at a handful of topics over a year', () => {
    // Was: VARC 2, QA 6, DILR 5 in a full year.
    const { picksBySection } = simulate(beginner(), 365);
    for (const section of SECTIONS) {
      expect(
        new Set(picksBySection[section]).size,
        `${section} reached too few distinct topics`,
      ).toBe(TOPICS_BY_SECTION[section].length);
    }
  });
});

describe('AUDIT: the completion ceiling', () => {
  it('can never show 100%, even with every topic maxed', () => {
    const total = totalSyllabusHours();
    const at = (status: CoverageStatus) =>
      remainingSyllabusHours(ALL_TOPICS.map((topic) => ({ topic, status })), 1);

    // The in-app loop (confidence taps) tops out at 'revising'.
    expect(at('revising')).toBe(60);
    expect(Math.round(((total - at('revising')) / total) * 100)).toBe(85);
    // Even the evidence-earned ceiling leaves 20h on the board.
    expect(at('exam_ready')).toBe(20);
    expect(Math.round(((total - at('exam_ready')) / total) * 100)).toBe(95);
  });

  it('needs three full-completion taps to max one topic', () => {
    let s: CoverageStatus | null = null;
    let taps = 0;
    while (taps < 10) {
      const next = applyConfidenceSignal(s, 'green');
      if (next === s) break;
      s = next; taps++;
    }
    expect(taps).toBe(3);
    expect(s).toBe('revising');
    // A 'partial' log sends blue, which stops one rung lower — so a student
    // who logs partial completions can never pass 'practicing' (35% left).
    expect(applyConfidenceSignal('practicing', 'blue')).toBe('practicing');
  });
});

describe('AUDIT: does the day fit the hours the student chose?', () => {
  const cases: [string, RoutineProfile][] = [
    ['beginner 8h foundation', beginner()],
    ['low-time 1.5h foundation', beginner({ weekdayHours: 1.5, weekendHours: 1.5 })],
    ['repeater 6h', beginner({ isRepeater: true, weekdayHours: 6, weekendHours: 6, currentStage: null })],
    ['mocks-stage 5h', beginner({ weekdayHours: 5, weekendHours: 5, currentStage: 'mocks' })],
  ];

  it('planned always equals committed — the closer is carved out, never added (A-5 fixed 8 Aug)', () => {
    // These four cases used to assert the BUG: 4-task days handed students
    // 15% more than their chosen hours (repeater 6h got 414m, mocks-stage 5h
    // got 345m). The closer's minutes now come out of the topic tasks, so
    // every day sums to exactly the budget.
    // Calendar-free Tuesday: on the real Monday 10 Aug, Home carves the exam
    // calendar's 2h mock-analysis out first (lib/exam-calendar) — planned
    // still equals committed, but the task count shifts. This test is about
    // the CLOSER's arithmetic, so it runs on a day the calendar leaves alone.
    const monday = new Date('2026-08-11T06:00:00Z');
    for (const [name, p] of cases) {
      const coverageRows = SECTIONS.flatMap((section) =>
        TOPICS_BY_SECTION[section].map((topic) => ({ section, topic, status: 'not_started', is_priority: false })));
      const history = {
        ...NO_HISTORY, daysSinceLastPracticedByTopic: {}, daysSincePlannedByTopic: {},
        timesPracticedByTopic: {}, postponedTopics: [], recentTopics: [],
        yesterday: null, yesterdayUnfinishedTopics: [],
        completedTasks: 0, plannedTasks: 0, planDays: 0,
      } as unknown as Parameters<typeof buildTopicChoices>[2];

      const choices = buildTopicChoices(coverageRows, p, history, null, [], 90, monday);
      const r = generateRoutine(
        p, monday, history as unknown as Parameters<typeof generateRoutine>[2],
        choices.choices, choices.extras,
      );
      const committed = Math.round((p.weekdayHours ?? 0) * 60);
      expect(r.estMinutes, `${name}: planned must equal committed`).toBe(committed);
    }
  });
});
