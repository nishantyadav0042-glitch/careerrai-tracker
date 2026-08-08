import { describe, it, expect } from 'vitest';
import {
  generateRoutine, archetypeRevisionMultiplier,
  type RoutineProfile, type Section,
} from './routine-engine';
import { chooseTopicForSection, applyConfidenceSignal, type TopicChoice, type CoverageStatus } from './topic-selector';
import { remainingSyllabusHours } from './study-pace';
import { totalSyllabusHours, topicsInSection } from './prep-model';
import { TOPIC_METADATA } from './topics-constants';

// ── THE SYLLABUS-COMPLETION AUDIT ───────────────────────────────────────────
//
// Founder audit, 8 Aug 2026. One question, asked of the shipped engine:
// "if a student follows CareerRai every day, do they finish the syllabus by
// their target date?"
//
// This file does NOT re-implement the planner. It imports the SAME functions
// the production route calls (generateRoutine, chooseTopicForSection,
// applyConfidenceSignal, remainingSyllabusHours) and drives them day by day
// with a student who does everything right.
//
// THESE ASSERTIONS ENCODE A BUG, ON PURPOSE. Today the plan teaches 13 of 46
// topics and then loops forever. When the planner is fixed these numbers will
// change and this test will fail — that failure is the point. Update the
// expectations in the same commit that fixes the planner, and the diff will
// show exactly how much more syllabus students now reach.

const SECTIONS: Section[] = ['VARC', 'DILR', 'QA'];
const TOPICS_BY_SECTION: Record<Section, string[]> = {
  VARC: topicsInSection('VARC'), DILR: topicsInSection('DILR'), QA: topicsInSection('QA'),
};
const ALL_TOPICS = Object.keys(TOPIC_METADATA);

interface SimState { coverage: Map<string, CoverageStatus>; lastPracticed: Map<string, number> }

/** Faithful copy of buildTopicChoices (routine-plan.ts / api/routine/today). */
function buildChoices(state: SimState, profile: RoutineProfile, dayIdx: number, revisionSeason: boolean): Record<Section, TopicChoice> {
  const revisionMultiplier = archetypeRevisionMultiplier(profile);
  const out = {} as Record<Section, TopicChoice>;
  for (const section of SECTIONS) {
    const candidates = TOPICS_BY_SECTION[section].map((topic) => {
      const last = state.lastPracticed.get(topic);
      return {
        topic,
        coverageStatus: state.coverage.get(topic) ?? null,
        daysSinceLastPracticed: last == null ? null : dayIdx - last,
        selfReportedBonus: section === profile.weakestSection && topic === profile.weakTopic,
        priorityBonus: false, focusBonus: false, postponedBonus: false, todayClassBonus: false,
      };
    });
    out[section] = chooseTopicForSection(candidates, revisionMultiplier, revisionSeason);
  }
  return out;
}

const NO_HISTORY = { daysSinceLastPracticed: { VARC: null, DILR: null, QA: null } };

/** A student who opens the app every day and marks every task fully done. */
function simulate(profile: RoutineProfile, days: number, start = new Date('2026-08-08T06:00:00')) {
  const state: SimState = { coverage: new Map(), lastPracticed: new Map() };
  const touched = new Set<string>();
  const picksBySection: Record<string, string[]> = { VARC: [], DILR: [], QA: [] };
  for (let day = 0; day < days; day++) {
    const date = new Date(start.getTime() + day * 86_400_000);
    const revisionSeason = date >= new Date(profile.attemptYear ?? 2026, 8, 1);
    const routine = generateRoutine(profile, date, NO_HISTORY, buildChoices(state, profile, day, revisionSeason));
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

describe('AUDIT: does following the plan finish the syllabus?', () => {
  it('teaches only a fraction of the syllabus, then loops forever', () => {
    // 365 days. Perfect attendance. Every task marked fully done.
    const { touched, remaining } = simulate(beginner(), 365);

    // 13 of 46. Thirty-three topics are never taught even once in a YEAR.
    expect(touched.size).toBe(13);
    expect(ALL_TOPICS.length - touched.size).toBe(33);
    // Of 397 syllabus hours, 276 are still outstanding after a perfect year.
    expect(remaining).toBe(276);
    expect(remaining).toBeGreaterThan(totalSyllabusHours() * 0.6);
  });

  it('gives the same syllabus progress to a 1.5h student and a 12h student', () => {
    // The most damaging single fact in this audit: daily hours change how much
    // work each task contains, but NOT which topics the plan advances through.
    // An 8x difference in effort buys identical syllabus coverage.
    const lowTime = simulate(beginner({ weekdayHours: 1.5, weekendHours: 1.5 }), 84);
    const aggressive = simulate(beginner({ weekdayHours: 12, weekendHours: 12 }), 84);

    expect(lowTime.touched.size).toBe(aggressive.touched.size);
    expect(lowTime.remaining).toBe(aggressive.remaining);
    expect([...lowTime.touched].sort()).toEqual([...aggressive.touched].sort());
  });

  it('lets a finished topic outrank an untouched one, which is the mechanism', () => {
    // After 40 days Percentages is 'revising' — worked three times, done.
    // Linear Equations has never been opened. The selector still prefers
    // Percentages, because weightage(40) + sequence outweighs the coverage
    // gap (revising=8 vs untouched=20). That single inequality is why the
    // plan stops advancing.
    const { state } = simulate(beginner(), 40);
    expect(state.coverage.get('Percentages')).toBe('revising');
    expect(state.coverage.get('Linear Equations')).toBeUndefined();

    const score = (topic: string, status: CoverageStatus | null) => {
      const meta = TOPIC_METADATA[topic];
      const COVER: Record<string, number> = { learning: 30, not_started: 22, unknown: 20, practicing: 12, revising: 8, exam_ready: 2 };
      return COVER[status ?? 'unknown'] + (meta?.weightage ?? 3) * 8 + Math.max(0, 30 - (meta?.sequenceRank ?? 30)) * 0.5;
    };
    const finished = score('Percentages', 'revising');
    const untouched = score('Linear Equations', null);
    expect(finished).toBeGreaterThan(untouched); // 62.5 > 62 — the whole bug
  });

  it('caps VARC at two topics in a year', () => {
    const { picksBySection } = simulate(beginner(), 365);
    expect(new Set(picksBySection.VARC).size).toBe(2);
    expect(new Set(picksBySection.QA).size).toBe(6);
    expect(new Set(picksBySection.DILR).size).toBe(5);
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
    const monday = new Date('2026-08-10T06:00:00');
    const results = cases.map(([name, p]) => {
      const state: SimState = { coverage: new Map(), lastPracticed: new Map() };
      const r = generateRoutine(p, monday, NO_HISTORY, buildChoices(state, p, 0, false));
      const committed = Math.round((p.weekdayHours ?? 0) * 60);
      return { name, planned: r.estMinutes, committed, tasks: r.tasks.length, phase: r.phase };
    });

    expect(results[0]).toMatchObject({ planned: 480, committed: 480, tasks: 3 });
    expect(results[1]).toMatchObject({ planned: 90, committed: 90, tasks: 3 });
    expect(results[2]).toMatchObject({ planned: 360, committed: 360, tasks: 4 });
    expect(results[3]).toMatchObject({ planned: 300, committed: 300, tasks: 4 });
    for (const r of results) expect(r.planned).toBe(r.committed);
  });
});
