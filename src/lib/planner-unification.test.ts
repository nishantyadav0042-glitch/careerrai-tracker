import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildFullPlan } from './full-plan';
import { buildWeekPlan } from './study-forecast';
import { projectPlan } from './plan-projection';
import { buildTopicChoices } from './day-topics';
import { generateRoutine, dayShape, type RoutineProfile } from './routine-engine';
import { studentEffortMultiplier } from './study-pace';
import { topicsInSection, SECTIONS } from './prep-model';
import type { Section } from './prep-model';

// ── ONE PLANNING AUTHORITY ──────────────────────────────────────────────────
//
// Founder, 11 Aug, after seeing Home and Whole Plan describe the same Tuesday
// differently:
//
//   "THE DEFINITION OF DONE: There is exactly one planning authority in
//    CareerRai. Home, today's API, and Whole Plan are different views /
//    materializations of that authority — not different planners."
//
// What he was looking at, both labelled "your plan", both for 11 August:
//
//   Home        3 tasks   Editorial Reading 264m · Arrangements 198m · Percentages 198m
//   Whole Plan  5 tasks   RC 4h · Percentages 1h · Inequalities 2.5h · Arrangements 2h · Caselets 1.5h
//
// This file is the door that keeps them one. It asserts the property, not the
// implementation: any future edit that reintroduces a second scorer, a second
// day-shape, or a plan that changes when you look at it twice, fails here.

const ALL = SECTIONS.flatMap((s) => topicsInSection(s));
const UNTOUCHED = ALL.map((topic) => ({ topic, status: 'not_started' }));
const TODAY = new Date('2026-08-11T00:00:00Z');
const EFFORT = studentEffortMultiplier({ isRepeater: false, lastYearPercentile: null });

const topicsOn = (items: { kind: string; label: string }[]) =>
  items.filter((i) => i.kind === 'topic').map((i) => i.label).sort();

// ── 1. Home's today and the Whole Plan's today are the same day ─────────────

describe('Home and the Whole Plan agree about TODAY', () => {
  const profile: RoutineProfile = {
    isWorkingProfessional: false,
    isRepeater: false,
    targetPercentile: 95,
    weekdayHours: 6,
    weekendHours: 6,
    weakestSection: 'DILR',
    strongestSection: 'VARC',
    weakTopic: null,
    currentStage: null,
    attemptYear: 2026,
  };

  /** Exactly what Home does: buildTopicChoices → generateRoutine. */
  function homeToday(daysToTarget: number | null) {
    const { choices, extras } = buildTopicChoices(
      UNTOUCHED.map((r) => ({ topic: r.topic, status: r.status })),
      profile,
      { daysSinceLastPracticed: { VARC: null, DILR: null, QA: null }, daysSinceLastPracticedByTopic: {}, daysSincePlannedByTopic: {}, postponedTopics: [] },
      null, [], daysToTarget, TODAY,
    );
    return generateRoutine(profile, TODAY, { daysSinceLastPracticed: { VARC: null, DILR: null, QA: null } }, choices, extras);
  }

  /** Exactly what the Whole Plan does. */
  function wholePlanToday(daysToTarget: number | null) {
    return buildFullPlan({
      coverage: UNTOUCHED, effort: EFFORT, weekdayHours: 6, today: TODAY,
      attemptYear: 2026, weakestSection: 'DILR', daysToSyllabusTarget: daysToTarget,
    }).days[0];
  }

  for (const daysToTarget of [25, 60, null]) {
    it(`same topics, same sections — syllabus target ${daysToTarget ?? 'unset'}`, () => {
      const home = homeToday(daysToTarget);
      const whole = wholePlanToday(daysToTarget);

      const homeTopics = home.tasks.filter((t) => t.topic).map((t) => t.topic!).sort();
      expect(topicsOn(whole.items), `Home: ${homeTopics.join(', ')}`).toEqual(homeTopics);

      // And the same sections, in the same proportions — the founder's screenshot
      // showed 3 tasks against 5 for one day, which is a shape disagreement even
      // when the topic list happens to overlap.
      const homeSections = home.tasks.filter((t) => t.topic).map((t) => t.section).sort();
      const wholeSections = whole.items.filter((i) => i.kind === 'topic').map((i) => i.section).sort();
      expect(wholeSections).toEqual(homeSections);
    });
  }

  it('the same block count, not just the same names', () => {
    const home = homeToday(25).tasks.filter((t) => t.topic).length;
    const whole = wholePlanToday(25).items.filter((i) => i.kind === 'topic').length;
    expect(whole, `Home ${home} tasks vs Whole Plan ${whole}`).toBe(home);
  });

  // ── Abhishek, 352d0c81…, his real Coverage Matrix on 11 Aug ───────────────
  //
  // The fresh-student cases above pass with an empty history, which is exactly
  // why they were not enough: with nothing opened, the memory clock never fires
  // and both surfaces are choosing from the same trivial pool. This is the case
  // that caught the last input gap. Run against his live rows, the Whole Plan's
  // second QA block came back Percentages while Home's was Inequalities — same
  // authority, different inputs, because buildFullPlan had never been told
  // WHICH TOPICS WERE ON YESTERDAY'S PLAN.
  //
  // 11 Aug, his words: "Bhaiya ye baar baar same hi percentage kyu revise
  // krwata hai." The plan that answered him must be the same plan on both
  // screens, or the answer is only half given.
  describe('a student mid-journey, with a real history', () => {
    const REAL: Record<string, string> = {
      Arrangements: 'revising', 'Binary Logic': 'not_started', Caselets: 'not_started',
      Charts: 'revising', 'Games & Tournaments': 'practicing', 'Hybrid DILR Sets': 'practicing',
      'Selection & Distribution': 'practicing', Tables: 'revising', 'Venn / Sets': 'not_started',
      Average: 'revising', Functions: 'practicing', Inequalities: 'learning',
      'Linear Equations': 'practicing', Percentages: 'revising', 'Profit & Loss': 'practicing',
      Progressions: 'learning', 'Quadratic Equations': 'revising', 'Ratio & Proportion': 'revising',
      'SI & CI': 'practicing', 'Time & Work': 'practicing', 'Time Speed Distance': 'practicing',
      'Editorial Reading': 'practicing', 'Reading Comprehension': 'revising', Vocabulary: 'revising',
    };
    const coverage = ALL.map((topic) => ({ topic, status: REAL[topic] ?? 'not_started' }));
    // His last five daily_routines rows, as day-gaps from 11 Aug.
    const RECENCY: Record<string, number | null> = {
      Arrangements: 0, Percentages: 0, 'Editorial Reading': 0,
      Charts: 1, 'Ratio & Proportion': 1, Vocabulary: 1,
      Tables: 2, 'Quadratic Equations': 2, 'Reading Comprehension': 2,
      'Hybrid DILR Sets': 4, Average: 4,
    };
    const abhishek: RoutineProfile = { ...profile, weakestSection: 'VARC', weekdayHours: 11, weekendHours: 11 };

    it('Home and the Whole Plan pick the same six blocks', () => {
      const { choices, extras } = buildTopicChoices(
        coverage.map((r) => ({ topic: r.topic, status: r.status, is_priority: r.topic === 'Vocabulary' })),
        abhishek,
        {
          daysSinceLastPracticed: { VARC: null, DILR: null, QA: null },
          daysSinceLastPracticedByTopic: RECENCY,
          daysSincePlannedByTopic: RECENCY,
          postponedTopics: [],
        },
        null, [], 25, TODAY,
      );
      const home = generateRoutine(abhishek, TODAY, { daysSinceLastPracticed: { VARC: null, DILR: null, QA: null } }, choices, extras);
      const whole = buildFullPlan({
        coverage, effort: EFFORT, weekdayHours: 11, today: TODAY, attemptYear: 2026,
        weakestSection: 'VARC', daysToSyllabusTarget: 25, priorityTopics: ['Vocabulary'],
        daysSincePlannedByTopic: RECENCY, daysSinceLastPracticedByTopic: RECENCY,
      }).days[0];

      const homeTopics = home.tasks.filter((t) => t.topic).map((t) => t.topic!).sort();
      expect(homeTopics.length).toBe(6); // 11h buys two blocks in every section
      expect(topicsOn(whole.items), `Home: ${homeTopics.join(', ')}`).toEqual(homeTopics);
    });

    it('and neither of them serves Percentages the morning after Percentages', () => {
      const whole = buildFullPlan({
        coverage, effort: EFFORT, weekdayHours: 11, today: TODAY, attemptYear: 2026,
        weakestSection: 'VARC', daysToSyllabusTarget: 25,
        daysSincePlannedByTopic: RECENCY, daysSinceLastPracticedByTopic: RECENCY,
      });
      expect(topicsOn(whole.days[0].items)).not.toContain('Percentages');
      // And the syllabus he was afraid of missing gets opened, not looped.
      const opened = new Set(whole.days.flatMap((d) => topicsOn(d.items)));
      expect(opened.size).toBe(ALL.length);
    });
  });

  it('holds for a working professional too — the archetype fork is shared', () => {
    const wp: RoutineProfile = { ...profile, isWorkingProfessional: true, weekdayHours: 3, weekendHours: 3 };
    const { choices, extras } = buildTopicChoices(
      UNTOUCHED.map((r) => ({ topic: r.topic, status: r.status })), wp,
      { daysSinceLastPracticed: { VARC: null, DILR: null, QA: null }, daysSinceLastPracticedByTopic: {}, daysSincePlannedByTopic: {}, postponedTopics: [] },
      null, [], 25, TODAY,
    );
    const home = generateRoutine(wp, TODAY, { daysSinceLastPracticed: { VARC: null, DILR: null, QA: null } }, choices, extras);
    const projected = projectPlan({
      days: [{ date: '2026-08-11', capacityHours: 3, weekend: false, phase: 'foundation' }],
      coverage: UNTOUCHED, effort: EFFORT, weakestSection: 'DILR',
      isWorkingProfessional: true, daysToSyllabusTarget: 25,
    });
    // A working professional's weekday is weak + ONE other, never all three.
    expect(new Set(projected[0].items.map((i) => i.section)).size).toBe(2);
    expect(projected[0].items.map((i) => i.topic).sort())
      .toEqual(home.tasks.filter((t) => t.topic).map((t) => t.topic!).sort());
  });
});

// ── 2. The Blueprint strip is the same plan, not a lookalike ────────────────

describe('the Blueprint 7-day strip is a window on the same planner', () => {
  it('matches the Whole Plan day for day', () => {
    const week = buildWeekPlan(UNTOUCHED, 6, TODAY, EFFORT, 7, null, {
      weakestSection: 'DILR', daysToSyllabusTarget: 25,
    });
    const full = buildFullPlan({
      coverage: UNTOUCHED, effort: EFFORT, weekdayHours: 6, today: TODAY,
      attemptYear: 2026, weakestSection: 'DILR', daysToSyllabusTarget: 25,
    });

    const mismatches: string[] = [];
    for (const day of week) {
      const other = full.days.find((d) => d.date === day.iso);
      if (!other) continue;
      // Mock days genuinely differ: the Whole Plan owns the exam calendar and
      // spends two of the day's hours on the mock, which the Blueprint strip
      // does not model. Compare the days where both describe the same budget.
      if (other.isMockDay || other.items.some((i) => i.kind === 'mock_analysis')) continue;
      const a = day.items.map((i) => i.topic).sort().join(' | ');
      const b = topicsOn(other.items).join(' | ');
      if (a !== b) mismatches.push(`${day.iso}\n  strip: ${a}\n  plan : ${b}`);
    }
    expect(mismatches, 'the two views of the same week disagree').toEqual([]);
  });
});

// ── 3. The plan does not change when you look at it twice ───────────────────

describe('a future day is a promise, not a re-roll', () => {
  const build = () => buildFullPlan({
    coverage: UNTOUCHED, effort: EFFORT, weekdayHours: 6, today: TODAY,
    attemptYear: 2026, weakestSection: 'DILR', daysToSyllabusTarget: 25,
    revisionDue: ['Percentages'],
  });

  it('is byte-identical across calls', () => {
    // Founder: "the plan I am making for tomorrow — when I open the plan, that
    // same plan should show." A projection that drifts between two reads of the
    // same state is not a plan, it is a suggestion.
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
  });

  it('15 August looks the same however many times it is asked for', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const day = build().days.find((d) => d.date === '2026-08-15')!;
      seen.add(topicsOn(day.items).join(' | '));
    }
    expect([...seen]).toHaveLength(1);
  });

  it('the projection itself is pure — no clock, no randomness', () => {
    const days = Array.from({ length: 30 }, (_, d) => ({
      date: new Date(Date.UTC(2026, 7, 11 + d)).toISOString().slice(0, 10),
      capacityHours: 6,
    }));
    const a = projectPlan({ days, coverage: UNTOUCHED, effort: EFFORT, weakestSection: 'QA', daysToSyllabusTarget: 40 });
    const b = projectPlan({ days, coverage: UNTOUCHED, effort: EFFORT, weakestSection: 'QA', daysToSyllabusTarget: 40 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ── 4. The 46/46 guarantee survives the unification ─────────────────────────

describe('46/46 through the WHOLE PLAN path, for every kind of student', () => {
  const PROFILES: { name: string; hours: number; repeater: boolean; pct: number | null; weakest: Section; target: number | null }[] = [
    { name: 'Abhishek — 11h, 25-day target', hours: 11, repeater: false, pct: null, weakest: 'QA', target: 25 },
    { name: '2h a day, no target set', hours: 2, repeater: false, pct: null, weakest: 'DILR', target: null },
    { name: '3h a day, 60-day target', hours: 3, repeater: false, pct: null, weakest: 'VARC', target: 60 },
    { name: '4h a day, 90-day target', hours: 4, repeater: false, pct: null, weakest: 'QA', target: 90 },
    { name: '6h a day, 20-day target', hours: 6, repeater: false, pct: null, weakest: 'DILR', target: 20 },
    { name: 'repeater, 4h, 45-day target', hours: 4, repeater: true, pct: 88, weakest: 'VARC', target: 45 },
    { name: '8h a day, no target', hours: 8, repeater: false, pct: null, weakest: 'QA', target: null },
  ];

  it('every profile opens all 46 topics', () => {
    const broken: string[] = [];
    for (const p of PROFILES) {
      const plan = buildFullPlan({
        coverage: UNTOUCHED,
        effort: studentEffortMultiplier({ isRepeater: p.repeater, lastYearPercentile: p.pct }),
        weekdayHours: p.hours, today: TODAY, attemptYear: 2026,
        weakestSection: p.weakest, daysToSyllabusTarget: p.target,
      });
      const scheduled = new Set(plan.days.flatMap((d) => topicsOn(d.items)));
      if (scheduled.size !== ALL.length) broken.push(`${p.name}: ${scheduled.size}/${ALL.length}`);
    }
    expect(broken, 'a student would finish their window with syllabus never opened').toEqual([]);
  });

  it('no day asks for more hours than the student committed', () => {
    const over: string[] = [];
    for (const p of PROFILES) {
      const plan = buildFullPlan({
        coverage: UNTOUCHED,
        effort: studentEffortMultiplier({ isRepeater: p.repeater, lastYearPercentile: p.pct }),
        weekdayHours: p.hours, today: TODAY, attemptYear: 2026,
        weakestSection: p.weakest, daysToSyllabusTarget: p.target,
      });
      for (const d of plan.days) {
        if (d.totalHours > p.hours + 0.01) over.push(`${p.name} ${d.date}: ${d.totalHours}h > ${p.hours}h`);
      }
    }
    expect(over.slice(0, 10), 'the plan asked for time the student never agreed to').toEqual([]);
  });

  it('never puts the same topic on a day twice', () => {
    for (const p of PROFILES) {
      const plan = buildFullPlan({
        coverage: UNTOUCHED,
        effort: studentEffortMultiplier({ isRepeater: p.repeater, lastYearPercentile: p.pct }),
        weekdayHours: p.hours, today: TODAY, attemptYear: 2026,
        weakestSection: p.weakest, daysToSyllabusTarget: p.target,
      });
      for (const d of plan.days) {
        const labels = topicsOn(d.items);
        expect(new Set(labels).size, `${p.name} ${d.date}: ${labels.join(', ')}`).toBe(labels.length);
      }
    }
  });

  it('no single topic eats the plan — the Percentages loop cannot return', () => {
    for (const p of PROFILES) {
      const plan = buildFullPlan({
        coverage: UNTOUCHED,
        effort: studentEffortMultiplier({ isRepeater: p.repeater, lastYearPercentile: p.pct }),
        weekdayHours: p.hours, today: TODAY, attemptYear: 2026,
        weakestSection: p.weakest, daysToSyllabusTarget: p.target,
      });
      const blocks = plan.days.flatMap((d) => topicsOn(d.items));
      const counts = new Map<string, number>();
      for (const t of blocks) counts.set(t, (counts.get(t) ?? 0) + 1);
      const worst = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      expect(worst[1] / blocks.length, `${p.name}: ${worst[0]} took ${worst[1]}/${blocks.length} blocks`)
        .toBeLessThan(0.15);
    }
  });
});

// ── 5. A coaching student's sheet still wins its own dates ──────────────────

describe('coaching dates survive the unification', () => {
  it('a class topic lands on the class date, through the same planner', () => {
    const plan = buildFullPlan({
      coverage: UNTOUCHED, effort: EFFORT, weekdayHours: 6, today: TODAY,
      attemptYear: 2026, weakestSection: 'DILR', horizonDays: 31,
      coachingByDate: { '2026-08-13': ['Mensuration'], '2026-08-14': ['Probability', 'Logarithms'] },
    });
    const on = (date: string) => topicsOn(plan.days.find((d) => d.date === date)!.items);
    expect(on('2026-08-13')).toContain('Mensuration');
    expect(on('2026-08-14')).toContain('Probability');
    expect(on('2026-08-14')).toContain('Logarithms');
  });
});

// ── 6. The structural guard: no second planner may reappear ─────────────────

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe('there is exactly ONE planning authority', () => {
  const files = walk('src');

  it('only the authority chooses topics', () => {
    // chooseTopicForSection / chooseTopicsForSection are the scorer INSIDE the
    // authority. Outside topic-selector itself, the only legitimate callers are
    // the authority's own entry points and add-block (one extra block, chosen
    // from topics explicitly excluded from today's plan).
    const ALLOWED = new Set([
      'src/lib/topic-selector.ts',
      'src/lib/day-topics.ts',
      'src/lib/plan-projection.ts',
      'src/app/api/routine/add-block/route.ts',
    ]);
    const offenders = files.filter((f) => {
      if (ALLOWED.has(f)) return false;
      const src = readFileSync(f, 'utf8');
      return /choose(Topic|Topics)ForSection\s*\(|chooseSectionDay\s*\(/.test(src);
    });
    expect(offenders, 'a surface is picking topics for itself').toEqual([]);
  });

  it('every plan surface reads the projection, never its own queue', () => {
    // The three surfaces the founder named. Each must reach the authority.
    for (const [file, must] of [
      ['src/lib/full-plan.ts', 'plan-projection'],
      ['src/lib/study-forecast.ts', 'plan-projection'],
      ['src/lib/routine-plan.ts', 'day-topics'],
      ['src/app/api/routine/today/route.ts', 'day-topics'],
    ] as const) {
      expect(readFileSync(file, 'utf8'), `${file} no longer reads the authority`).toContain(must);
    }
  });

  it('the day SHAPE is decided in one place too', () => {
    // Home used to split its day inline and the whole plan used plan-mix's
    // weights — two shapes for one day. dayShape is now the only splitter, and
    // plan-mix's day-shaping helpers are retired.
    const shapers = files.filter((f) => {
      if (f === 'src/lib/routine-engine.ts') return false;
      return /\b(sectionsForDay|splitDayHours|drawFromSection)\s*\(/.test(readFileSync(f, 'utf8'));
    });
    expect(shapers, 'a second day-shape model is back').toEqual([]);
  });

  it('dayShape and generateRoutine cannot drift apart', () => {
    // generateRoutine consumes dayShape rather than re-deriving it, so the
    // minutes it hands out must total the shape exactly.
    for (const hours of [1, 2, 3, 4.5, 6, 8, 11]) {
      for (const phase of ['foundation', 'intensive', 'revision'] as const) {
        const shape = dayShape({
          hours, weakestSection: 'DILR', isWorkingProfessional: false,
          isRepeater: false, weekend: false, phase,
        });
        const topicMinutes = shape.sections.reduce((s, x) => s + x.minutes, 0);
        expect(topicMinutes + shape.closerMinutes, `${hours}h ${phase}`).toBe(shape.totalMinutes);
      }
    }
  });
});
