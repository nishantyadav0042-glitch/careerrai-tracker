import { describe, it, expect } from 'vitest';
import {
  generateRoutine, dayShape, blocksForMinutes,
  MAX_TOPIC_MINUTES, MAX_TOPIC_BLOCKS_PER_SECTION,
  type RoutineProfile, type Section,
} from './routine-engine';
import { QUANT_TOPICS, VERBAL_TOPICS, LRDI_TOPICS } from './topics-constants';

// ── The study plan's load-bearing invariants, asserted over the real matrix ──
//
// Backbone audit, 13 Aug. Unit tests on individual helpers had all passed for
// months while the plan a real 8-hour student received was wrong — because
// nothing exercised the whole engine across the budget × date × archetype
// space. This does. It generates actual routines and checks the properties
// that must hold for EVERY student, on every day, forever:
//
//   1. HOURS ARE SACRED. Sum of task minutes == the student's own budget.
//   2. No single topic block over MAX_TOPIC_MINUTES (unless the section's
//      own block cap binds — see blocksForMinutes).
//   3. No section gets more than MAX_TOPIC_BLOCKS_PER_SECTION topics.
//   4. No topic appears twice in one day.
//   5. Small-day law: tiny days get few tasks and never a mock.
//
// What this caught: blocksForMinutes used Math.round, so a 144-minute slice
// became ONE 144-minute block — 2h24m on a single chapter, over the stated
// cap. Every student at 4h+ was affected, every day. Ceil fixed it; case 2
// below is what keeps it fixed.

const SECTIONS: Section[] = ['VARC', 'DILR', 'QA'];
const POOL: Record<Section, string[]> = {
  VARC: [...VERBAL_TOPICS], DILR: [...LRDI_TOPICS], QA: [...QUANT_TOPICS],
};

function choices() {
  const topicChoices = {} as Record<Section, { topic: string; score: number; reasons: string[]; coverageStatus: 'not_started' }>;
  const extra = {} as Record<Section, { topic: string; score: number; reasons: string[]; coverageStatus: 'not_started' }[]>;
  for (const s of SECTIONS) {
    topicChoices[s] = { topic: POOL[s][0], score: 50, reasons: [], coverageStatus: 'not_started' };
    extra[s] = POOL[s].map((t) => ({ topic: t, score: 50, reasons: [], coverageStatus: 'not_started' as const }));
  }
  return { topicChoices, extra };
}

const EMPTY_HISTORY = {
  recentTopics: [], daysSinceLastPracticedByTopic: {}, daysSincePlannedByTopic: {},
  timesPracticedByTopic: {}, postponedTopics: [], yesterday: null,
  yesterdayUnfinishedTopics: [], completedTasks: 0, plannedTasks: 0, planDays: 0,
} as unknown as Parameters<typeof generateRoutine>[2];

function profile(over: Partial<RoutineProfile> = {}): RoutineProfile {
  return {
    isWorkingProfessional: false, isRepeater: false, targetPercentile: 95,
    weekdayHours: 2, weekendHours: 2, weakestSection: 'VARC', strongestSection: 'QA',
    weakTopic: null, currentStage: null, attemptYear: 2026, ...over,
  } as RoutineProfile;
}

/** Every budget a student can actually set, including both bounds. */
const BUDGETS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 14, 16];
const DATES: [string, Date][] = [
  ['weekday-Aug (foundation)', new Date('2026-08-13T06:00:00Z')],
  ['weekend-Aug', new Date('2026-08-16T06:00:00Z')],
  ['weekday-Sep (intensive)', new Date('2026-09-17T06:00:00Z')],
  ['weekend-Sep', new Date('2026-09-20T06:00:00Z')],
  ['Nov (revision)', new Date('2026-11-05T06:00:00Z')],
];
const ARCHETYPES: [string, Partial<RoutineProfile>][] = [
  ['fresher', {}],
  ['working professional', { isWorkingProfessional: true }],
  ['repeater', { isRepeater: true }],
  ['working professional + repeater', { isWorkingProfessional: true, isRepeater: true }],
];

interface Case { label: string; tasks: { section: string; topic: string | null; estMinutes: number }[]; wanted: number }

function everyCase(): Case[] {
  const out: Case[] = [];
  for (const hours of BUDGETS) {
    for (const [dateName, date] of DATES) {
      for (const [archName, over] of ARCHETYPES) {
        const { topicChoices, extra } = choices();
        const r = generateRoutine(
          profile({ weekdayHours: hours, weekendHours: hours, ...over }),
          date, EMPTY_HISTORY, topicChoices, extra,
        );
        out.push({
          label: `${hours}h · ${dateName} · ${archName}`,
          tasks: r.tasks.map((t) => ({ section: t.section, topic: t.topic, estMinutes: t.estMinutes })),
          wanted: Math.max(30, Math.round(hours * 60)),
        });
      }
    }
  }
  return out;
}

const CASES = everyCase();

describe('the whole engine, across every budget × date × archetype', () => {
  it('covers the real matrix, not a happy path', () => {
    expect(CASES.length).toBe(BUDGETS.length * DATES.length * ARCHETYPES.length);
  });

  it('HOURS ARE SACRED — planned minutes equal the student\'s own budget, exactly', () => {
    // Founder's law, 6 Aug: "keep their hours fixed… don't change the hours on
    // your own." Three layers used to sit between the number a student typed
    // and the plan they got (pace demand, capacity shrink, volume factor);
    // all three are gone and this is what keeps them gone.
    for (const c of CASES) {
      const got = c.tasks.reduce((s, t) => s + t.estMinutes, 0);
      expect(got, `${c.label}: wanted ${c.wanted}m, planned ${got}m`).toBe(c.wanted);
    }
  });

  it('no single topic block runs longer than the cap', () => {
    // Unless the section's whole slice exceeds what MAX_TOPIC_BLOCKS_PER_SECTION
    // blocks can hold — a >6h slice in one section — which is the deliberate
    // "three topics a day in one section is already the most anyone holds" limit.
    for (const c of CASES) {
      const sliceMinutes: Record<string, number> = {};
      for (const t of c.tasks) if (t.topic) sliceMinutes[t.section] = (sliceMinutes[t.section] ?? 0) + t.estMinutes;
      for (const t of c.tasks) {
        if (!t.topic) continue;
        const capBinds = (sliceMinutes[t.section] ?? 0) > MAX_TOPIC_BLOCKS_PER_SECTION * MAX_TOPIC_MINUTES;
        if (capBinds) continue;
        expect(t.estMinutes, `${c.label}: ${t.section}/${t.topic} ran ${t.estMinutes}m`).toBeLessThanOrEqual(MAX_TOPIC_MINUTES);
      }
    }
  });

  it('no section is handed more topics than a student can hold', () => {
    for (const c of CASES) {
      const perSection: Record<string, number> = {};
      for (const t of c.tasks) if (t.topic) perSection[t.section] = (perSection[t.section] ?? 0) + 1;
      for (const [s, n] of Object.entries(perSection)) {
        expect(n, `${c.label}: ${s} got ${n} topics`).toBeLessThanOrEqual(MAX_TOPIC_BLOCKS_PER_SECTION);
      }
    }
  });

  it('never plans the same topic twice in one day', () => {
    for (const c of CASES) {
      const topics = c.tasks.map((t) => t.topic).filter((t): t is string => !!t);
      expect(new Set(topics).size, `${c.label}: ${topics.join(', ')}`).toBe(topics.length);
    }
  });
});

describe('blocksForMinutes honours its own contract', () => {
  it('splits a slice so no block exceeds the cap, until the block cap binds', () => {
    for (let m = 1; m <= MAX_TOPIC_BLOCKS_PER_SECTION * MAX_TOPIC_MINUTES; m++) {
      const per = m / blocksForMinutes(m);
      expect(per, `${m}m split into ${blocksForMinutes(m)} blocks = ${per}m each`).toBeLessThanOrEqual(MAX_TOPIC_MINUTES);
    }
  });

  it('the exact regression: 144 minutes is two blocks, not one', () => {
    // Math.round made this 1 — a 2h24m block on a single chapter.
    expect(blocksForMinutes(144)).toBe(2);
    expect(blocksForMinutes(121)).toBe(2);
    expect(blocksForMinutes(120)).toBe(1);
  });

  it('never returns zero blocks for a real slice', () => {
    expect(blocksForMinutes(1)).toBe(1);
    expect(blocksForMinutes(0)).toBe(1);
  });
});

describe('the small-day law', () => {
  const shape = (hours: number, over: Partial<Parameters<typeof dayShape>[0]> = {}) =>
    dayShape({ hours, weakestSection: 'VARC', isWorkingProfessional: false, isRepeater: false, weekend: false, phase: 'intensive', ...over });

  it('≤45 minutes is the weak section alone — one finishable task', () => {
    expect(shape(0.5).sections).toHaveLength(1);
    expect(shape(0.75).sections).toHaveLength(1);
    expect(shape(0.5).sections[0].section).toBe('VARC');
  });

  it('≤75 minutes is the weak section plus one', () => {
    expect(shape(1).sections).toHaveLength(2);
    expect(shape(1.25).sections).toHaveLength(2);
  });

  it('above 75 minutes the full day opens up', () => {
    expect(shape(2).sections).toHaveLength(3);
  });

  it('a small day NEVER carries a closing mock — it cannot hold one', () => {
    for (const h of [0.5, 0.75, 1, 1.25]) {
      expect(shape(h).hasCloser, `${h}h`).toBe(false);
      expect(shape(h).closerMinutes, `${h}h`).toBe(0);
    }
  });

  it('the closer is CARVED OUT of the budget, never added on top', () => {
    // Until 8 Aug it was appended after topics had consumed 100%, so every
    // repeater and intensive-phase student silently got ~15% more than the
    // hours they chose (audit finding A-5).
    for (const h of [2, 4, 8]) {
      const s = shape(h);
      const topicMinutes = s.sections.reduce((sum, x) => sum + x.minutes, 0);
      expect(topicMinutes + s.closerMinutes, `${h}h`).toBe(s.totalMinutes);
    }
  });

  it('the weak section always leads and absorbs the rounding', () => {
    for (const h of [1, 2, 4, 8]) {
      const s = shape(h);
      expect(s.sections[0].section, `${h}h`).toBe('VARC');
      expect(s.sections[0].isPriority, `${h}h`).toBe(true);
    }
  });
});

describe('archetype behaviour is real, not decorative', () => {
  it('a working professional\'s WEEKDAY is leaner than their weekend', () => {
    const base = { hours: 4, weakestSection: 'VARC' as const, isRepeater: false, phase: 'intensive' as const };
    const weekday = dayShape({ ...base, isWorkingProfessional: true, weekend: false });
    const weekend = dayShape({ ...base, isWorkingProfessional: true, weekend: true });
    expect(weekday.sections.length).toBeLessThan(weekend.sections.length);
  });

  it('a fresher keeps all three sections on a weekday', () => {
    const fresher = dayShape({ hours: 4, weakestSection: 'VARC', isWorkingProfessional: false, isRepeater: false, weekend: false, phase: 'intensive' });
    expect(fresher.sections).toHaveLength(3);
  });

  it('a repeater gets a closing block even in foundation phase', () => {
    const rep = dayShape({ hours: 4, weakestSection: 'VARC', isWorkingProfessional: false, isRepeater: true, weekend: false, phase: 'foundation' });
    const fresh = dayShape({ hours: 4, weakestSection: 'VARC', isWorkingProfessional: false, isRepeater: false, weekend: false, phase: 'foundation' });
    expect(rep.hasCloser).toBe(true);
    expect(fresh.hasCloser).toBe(false);
  });
});

describe('generation is deterministic', () => {
  it('the same student on the same day gets the same plan, every time', () => {
    const p = profile({ weekdayHours: 6, weekendHours: 6 });
    const d = new Date('2026-09-17T06:00:00Z');
    const runs = Array.from({ length: 5 }, () => {
      const { topicChoices, extra } = choices();
      return JSON.stringify(generateRoutine(p, d, EMPTY_HISTORY, topicChoices, extra).tasks);
    });
    expect(new Set(runs).size, 'plan generation is not deterministic').toBe(1);
  });
});
