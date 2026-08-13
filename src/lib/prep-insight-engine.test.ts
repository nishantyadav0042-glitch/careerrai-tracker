import { describe, it, expect } from 'vitest';
import { computePrepInsight, type MatrixEntry } from './prep-insight-engine';
import { TOPIC_METADATA, MOCK_PREP_UNITS, READING_HABIT_UNITS } from './topics-constants';

const TODAY = new Date('2026-08-13T00:00:00.000Z');

const BASE = {
  ambitionDate: null as string | null,
  selfStudyHours: null as number | null,
  isRepeater: null as boolean | null,
  lastYearPercentile: null as number | null,
  today: TODAY,
};

/**
 * Mirrors what screen-topic-coverage actually saves: a row for EVERY unit in
 * every section — the 46 exam topics AND the MOCKS/READING habit tracks —
 * defaulting anything untapped to 'not_started'. Building fixtures any other
 * way hides real bugs: the habit rows carry no topic metadata, and an earlier
 * version of the engine filtered them out entirely, which silently disabled
 * every mock detector in production.
 */
function fullMatrix(overrides: Record<string, MatrixEntry['status']>): MatrixEntry[] {
  const topics: MatrixEntry[] = Object.entries(TOPIC_METADATA).map(([topic, meta]) => ({
    section: meta.section, topic, status: overrides[topic] ?? 'not_started',
  }));
  const habits: MatrixEntry[] = [
    ...MOCK_PREP_UNITS.map((t) => ({ section: 'MOCKS', topic: t, status: overrides[t] ?? ('not_started' as const) })),
    ...READING_HABIT_UNITS.map((t) => ({ section: 'READING', topic: t, status: overrides[t] ?? ('not_started' as const) })),
  ];
  return [...topics, ...habits];
}

const allOf = (list: string[], status: MatrixEntry['status']) => Object.fromEntries(list.map((t) => [t, status]));
const QA_TOPICS = Object.keys(TOPIC_METADATA).filter((t) => TOPIC_METADATA[t].section === 'QA');
const VARC_TOPICS = Object.keys(TOPIC_METADATA).filter((t) => TOPIC_METADATA[t].section === 'VARC');

describe('insufficient evidence — no manufactured insight', () => {
  it('a completely fresh student is told plainly, not given a fake finding', () => {
    const r = computePrepInsight({ ...BASE, matrix: fullMatrix({}) });
    expect(r.state).toBe('insufficient_evidence');
    expect(r.cards).toEqual([]);
    expect(r.strength).toBeNull();
  });

  it('gives a fresh student a real place to start instead', () => {
    const r = computePrepInsight({ ...BASE, matrix: fullMatrix({}) });
    expect(r.startingPoints.length).toBe(3);
    // Every suggestion must be prerequisite-free — you can actually begin there.
    for (const sp of r.startingPoints) {
      expect(TOPIC_METADATA[sp.topic].prerequisites).toEqual([]);
    }
  });

  it('one or two touched topics is still not enough to diagnose', () => {
    expect(computePrepInsight({ ...BASE, matrix: fullMatrix({ Percentages: 'learning' }) }).state).toBe('insufficient_evidence');
    expect(computePrepInsight({ ...BASE, matrix: fullMatrix({ Percentages: 'practicing', Average: 'learning' }) }).state).toBe('insufficient_evidence');
  });

  it('null and empty matrices do not crash', () => {
    expect(() => computePrepInsight({ ...BASE, matrix: null })).not.toThrow();
    expect(() => computePrepInsight({ ...BASE, matrix: [] })).not.toThrow();
  });
});

describe('two findings still escape the evidence gate — they need no volume', () => {
  // The audit's worst false negative: a student practising Functions with the
  // chain broken beneath it got NO cards, because they had only touched one
  // topic. That is the single highest-value insight the engine can produce.
  it('a foundation gap surfaces even for a barely-started student', () => {
    const r = computePrepInsight({ ...BASE, matrix: fullMatrix({ Functions: 'practicing' }) });
    expect(r.state).toBe('diagnosed');
    expect(r.cards.some((c) => c.rootCause === 'foundation')).toBe(true);
  });

  it('an already-passed date surfaces even for a barely-started student', () => {
    const r = computePrepInsight({
      ...BASE, matrix: fullMatrix({ Percentages: 'learning' }),
      ambitionDate: '2026-08-01', selfStudyHours: 4,
    });
    expect(r.cards.some((c) => c.key === 'timeline-passed')).toBe(true);
  });
});

describe('weightage is never summed across sections', () => {
  it('coverage is reported per section, and no global percentage exists', () => {
    const r = computePrepInsight({ ...BASE, matrix: fullMatrix(allOf(QA_TOPICS, 'revising')) });
    expect(r.sectionCoverage.map((s) => s.sec).sort()).toEqual(['DILR', 'QA', 'VARC']);
    // QA fully done must not leak into the other sections' numbers.
    expect(r.sectionCoverage.find((s) => s.sec === 'QA')!.donePct).toBe(100);
    expect(r.sectionCoverage.find((s) => s.sec === 'VARC')!.donePct).toBe(0);
    expect(r.sectionCoverage.find((s) => s.sec === 'DILR')!.donePct).toBe(0);
    expect(r).not.toHaveProperty('weightedCoverage');
  });

  it('no student-facing copy claims anything about "marks"', () => {
    // TRUST-OS: weightage is reviewed editorial content, explicitly "never a
    // cited fact" — so it may rank topics but must never be spoken of as CAT
    // marks. This sweeps every string the engine can emit.
    const profiles: Record<string, MatrixEntry['status']>[] = [
      allOf(QA_TOPICS, 'revising'),
      allOf(VARC_TOPICS, 'revising'),
      { Functions: 'practicing' },
      { Vocabulary: 'revising', Grammar: 'revising' },
      Object.assign(allOf(QA_TOPICS.slice(0, 10), 'practicing'), { 'Full Length Mocks': 'practicing' as const }),
    ];
    for (const p of profiles) {
      const r = computePrepInsight({ ...BASE, matrix: fullMatrix(p), ambitionDate: '2026-11-01', selfStudyHours: 4 });
      const text = [...r.cards, ...(r.strength ? [r.strength] : [])]
        .flatMap((c) => [c.headline, c.note ?? '', ...(c.stats ?? [])]).join(' ');
      expect(text.toLowerCase()).not.toContain('marks');
    }
  });
});

describe('timeline arithmetic can never print an absurd number', () => {
  it('an impossible date says the scope does not fit — with no per-day figure', () => {
    const r = computePrepInsight({
      ...BASE, matrix: fullMatrix({ Percentages: 'practicing', Average: 'practicing', 'Profit & Loss': 'practicing' }),
      ambitionDate: '2026-08-25', selfStudyHours: 3,
    });
    const card = r.cards.find((c) => c.rootCause === 'timeline');
    expect(card?.key).toBe('timeline-impossible');
    expect(`${card?.headline} ${card?.stats?.join(' ')}`).not.toMatch(/\d+h\/day/);
  });

  it('a passed date is its own state, not a pace problem', () => {
    const r = computePrepInsight({
      ...BASE, matrix: fullMatrix(allOf(QA_TOPICS.slice(0, 5), 'practicing')),
      ambitionDate: '2026-08-01', selfStudyHours: 4,
    });
    expect(r.cards.find((c) => c.rootCause === 'timeline')?.key).toBe('timeline-passed');
  });

  it('zero hours/day is treated as missing, never divided by', () => {
    const r = computePrepInsight({
      ...BASE, matrix: fullMatrix(allOf(QA_TOPICS.slice(0, 5), 'practicing')),
      ambitionDate: '2026-12-01', selfStudyHours: 0,
    });
    expect(r.cards.some((c) => c.rootCause === 'timeline')).toBe(false);
  });

  it('a tight-but-possible date quotes a sane daily figure', () => {
    const r = computePrepInsight({
      ...BASE, matrix: fullMatrix(allOf(QA_TOPICS.slice(0, 5), 'practicing')),
      ambitionDate: '2026-09-20', selfStudyHours: 4,
    });
    const card = r.cards.find((c) => c.key === 'timeline-tight');
    expect(card).toBeTruthy();
    const hours = Number(/~([\d.]+)h\/day/.exec(card!.headline)?.[1]);
    expect(hours).toBeGreaterThan(0);
    expect(hours).toBeLessThanOrEqual(14);
  });

  it('an invalid date string never crashes or fires', () => {
    const r = computePrepInsight({
      ...BASE, matrix: fullMatrix(allOf(QA_TOPICS.slice(0, 5), 'practicing')),
      ambitionDate: 'not-a-date', selfStudyHours: 4,
    });
    expect(r.cards.some((c) => c.rootCause === 'timeline')).toBe(false);
  });
});

describe('prerequisite traversal finds the ROOT, not the nearest link', () => {
  it('walks a 2-deep chain to the deepest unmet foundation', () => {
    // Functions ← Quadratic Equations ← Linear Equations, all unmet below.
    const r = computePrepInsight({ ...BASE, matrix: fullMatrix({ Functions: 'practicing' }) });
    const card = r.cards.find((c) => c.rootCause === 'foundation');
    expect(card!.headline).toContain('Linear Equations');
    expect(card!.headline).not.toContain('Quadratic Equations');
  });

  it('a prerequisite that is merely "learning" counts as satisfied', () => {
    // The metadata says a prerequisite should be "at least started" — so
    // learning/practicing/revising must never be reported as missing.
    const r = computePrepInsight({
      ...BASE,
      matrix: fullMatrix({ 'Quadratic Equations': 'practicing', 'Linear Equations': 'learning', Percentages: 'practicing' }),
    });
    expect(r.cards.some((c) => c.rootCause === 'foundation')).toBe(false);
  });

  it('a fully satisfied chain produces no foundation card at all', () => {
    const r = computePrepInsight({
      ...BASE,
      matrix: fullMatrix({ Functions: 'practicing', 'Quadratic Equations': 'revising', 'Linear Equations': 'revising', Percentages: 'practicing' }),
    });
    expect(r.cards.some((c) => c.rootCause === 'foundation')).toBe(false);
  });

  it('terminates on multi-prerequisite topics without hanging', () => {
    // Hybrid DILR Sets needs both Tables and Arrangements.
    expect(() => computePrepInsight({
      ...BASE, matrix: fullMatrix({ 'Hybrid DILR Sets': 'practicing', Tables: 'revising' }),
    })).not.toThrow();
  });
});

describe('mock detectors read the habit rows, which carry no topic metadata', () => {
  // The bug this pins: the engine filtered the matrix down to metadata-bearing
  // rows before any detector ran, which deleted MOCKS/READING entirely. Every
  // mock lookup then returned null, so "not one full mock" fired at students
  // who mock weekly, and the error-log detector could never fire at all.
  const tenDone = allOf(QA_TOPICS.slice(0, 10), 'practicing');

  it('a student who mocks is never told they have never mocked', () => {
    const r = computePrepInsight({
      ...BASE,
      matrix: fullMatrix({ ...tenDone, 'Full Length Mocks': 'practicing', 'Error Log': 'practicing', 'Mock Analysis': 'practicing' }),
    });
    expect(r.cards.some((c) => c.key === 'never-mocked')).toBe(false);
  });

  it('mocks without an error log is detected', () => {
    const r = computePrepInsight({
      ...BASE,
      matrix: fullMatrix({ ...tenDone, 'Full Length Mocks': 'practicing', 'Error Log': 'not_started' }),
    });
    expect(r.cards.some((c) => c.key === 'mock-no-log')).toBe(true);
  });

  it('full mock hygiene can be earned as the strength', () => {
    const r = computePrepInsight({
      ...BASE,
      matrix: fullMatrix({ ...tenDone, 'Full Length Mocks': 'practicing', 'Error Log': 'practicing', 'Mock Analysis': 'practicing' }),
    });
    const all = [...r.cards, ...(r.strength ? [r.strength] : [])];
    expect(all.some((c) => c.key === 'mock-hygiene')).toBe(true);
  });

  it('a matrix with no habit rows at all stays silent rather than accusing', () => {
    // An older saved matrix predating the habit tracks must not be read as
    // proof the student never mocks.
    const noHabits = Object.entries(TOPIC_METADATA).map(([topic, meta]) => ({
      section: meta.section, topic, status: (tenDone[topic] ?? 'not_started') as MatrixEntry['status'],
    }));
    const r = computePrepInsight({ ...BASE, matrix: noHabits });
    expect(r.cards.some((c) => c.key === 'never-mocked')).toBe(false);
  });
});

describe('root-cause grouping — one problem is never shown twice', () => {
  it('never emits two cards sharing a root cause', () => {
    const profiles: Record<string, MatrixEntry['status']>[] = [
      allOf(QA_TOPICS, 'revising'),
      allOf(VARC_TOPICS, 'revising'),
      Object.assign(allOf(QA_TOPICS.slice(0, 10), 'learning'), { Percentages: 'practicing' as const }),
      { Functions: 'practicing', 'Hybrid DILR Sets': 'practicing' },
    ];
    for (const p of profiles) {
      const r = computePrepInsight({ ...BASE, matrix: fullMatrix(p), ambitionDate: '2026-11-01', selfStudyHours: 4 });
      const causes = r.cards.map((c) => c.rootCause);
      expect(new Set(causes).size).toBe(causes.length);
    }
  });

  it('the strength never shares a root cause with a shown risk', () => {
    // "QA is your strongest" must never sit beneath "your QA foundation is broken".
    const profiles: Record<string, MatrixEntry['status']>[] = [
      allOf(QA_TOPICS, 'revising'),
      Object.assign(allOf(QA_TOPICS.slice(0, 8), 'revising'), { Functions: 'practicing' as const }),
    ];
    for (const p of profiles) {
      const r = computePrepInsight({ ...BASE, matrix: fullMatrix(p), ambitionDate: '2026-11-01', selfStudyHours: 4 });
      if (!r.strength) continue;
      expect(r.cards.map((c) => c.rootCause)).not.toContain(r.strength.rootCause);
    }
  });

  it('shows at most two findings — there is no three-card quota', () => {
    const r = computePrepInsight({
      ...BASE,
      matrix: fullMatrix(Object.assign(allOf(QA_TOPICS.slice(0, 12), 'learning'), { Functions: 'practicing' as const })),
      ambitionDate: '2026-09-01', selfStudyHours: 2,
    });
    expect(r.cards.length).toBeLessThanOrEqual(2);
  });
});

describe('the strength must be earned', () => {
  it('touching many topics without mastering any is not a strength', () => {
    // 8 topics at 'learning' — activity, but nothing in revision.
    const r = computePrepInsight({ ...BASE, matrix: fullMatrix(allOf(QA_TOPICS.slice(0, 8), 'learning')) });
    expect(r.strength?.key).not.toBe('section-strength');
  });

  it('real mastery does qualify', () => {
    const r = computePrepInsight({ ...BASE, matrix: fullMatrix(allOf(QA_TOPICS, 'revising')) });
    const all = [...r.cards, ...(r.strength ? [r.strength] : [])];
    expect(all.some((c) => c.polarity === 'strength')).toBe(true);
  });

  it('no strength is invented when nothing qualifies', () => {
    const r = computePrepInsight({ ...BASE, matrix: fullMatrix(allOf(QA_TOPICS.slice(0, 6), 'learning')) });
    // Either a genuinely earned strength, or none at all — never filler.
    if (r.strength) expect(r.strength.severity).toBeGreaterThanOrEqual(4);
  });
});

describe('ranking prefers the non-obvious', () => {
  it('a graph-derived finding outranks a restatement of the student\'s own taps', () => {
    const r = computePrepInsight({
      ...BASE,
      matrix: fullMatrix({ Functions: 'practicing', Percentages: 'practicing', 'Profit & Loss': 'practicing' }),
    });
    // The foundation gap (nonObvious 10) must lead, not any "X is untouched" line.
    expect(r.cards[0].rootCause).toBe('foundation');
  });

  it('every emitted signal carries all three ranking dimensions', () => {
    const r = computePrepInsight({
      ...BASE, matrix: fullMatrix(allOf(QA_TOPICS.slice(0, 10), 'practicing')),
      ambitionDate: '2026-09-20', selfStudyHours: 4,
    });
    for (const c of [...r.cards, ...(r.strength ? [r.strength] : [])]) {
      expect(c.severity).toBeGreaterThan(0);
      expect(c.confidence).toBeGreaterThan(0);
      expect(c.nonObvious).toBeGreaterThan(0);
    }
  });
});

describe('hostile input', () => {
  it('unknown topic names are ignored, not crashed on', () => {
    expect(() => computePrepInsight({
      ...BASE, matrix: [...fullMatrix({ Percentages: 'practicing' }), { section: 'QA', topic: 'Made Up Topic', status: 'revising' }],
    })).not.toThrow();
  });

  it('duplicate rows do not crash', () => {
    expect(() => computePrepInsight({
      ...BASE, matrix: [...fullMatrix({ Percentages: 'practicing' }), { section: 'QA', topic: 'Percentages', status: 'not_started' }],
    })).not.toThrow();
  });
});
