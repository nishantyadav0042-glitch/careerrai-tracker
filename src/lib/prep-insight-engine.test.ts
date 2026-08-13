import { describe, it, expect } from 'vitest';
import { computePrepInsight, type MatrixEntry } from './prep-insight-engine';
import { TOPIC_METADATA } from './topics-constants';

const TODAY = new Date('2026-08-13T00:00:00.000Z');

const BASE = {
  ambitionDate: null as string | null,
  selfStudyHours: null as number | null,
  isRepeater: null as boolean | null,
  lastYearPercentile: null as number | null,
  today: TODAY,
};

/**
 * The real topic-coverage screen always writes a row for all 46 core topics,
 * defaulting anything the student didn't tap to 'not_started' (confirmed in
 * screen-topic-coverage.tsx: `statuses[unit] ?? 'not_started'` over every
 * unit in every section). Test fixtures build the same shape — a HANDFUL of
 * bare rows is not a real matrix shape and exercises edge cases production
 * data can't hit.
 */
function fullMatrix(overrides: Record<string, MatrixEntry['status']>): MatrixEntry[] {
  return Object.entries(TOPIC_METADATA).map(([topic, meta]) => ({
    section: meta.section,
    topic,
    status: overrides[topic] ?? 'not_started',
  }));
}

describe('fresh detection', () => {
  it('empty matrix is fresh', () => {
    const r = computePrepInsight({ ...BASE, matrix: [] });
    expect(r.fresh).toBe(true);
    expect(r.cards).toEqual([]);
  });

  it('a full matrix with everything not_started is fresh', () => {
    const r = computePrepInsight({ ...BASE, matrix: fullMatrix({}) });
    expect(r.fresh).toBe(true);
  });

  it('null matrix is fresh, not a crash', () => {
    const r = computePrepInsight({ ...BASE, matrix: null });
    expect(r.fresh).toBe(true);
  });

  it('one real tap ends fresh', () => {
    const r = computePrepInsight({ ...BASE, matrix: fullMatrix({ Percentages: 'practicing' }) });
    expect(r.fresh).toBe(false);
  });
});

describe('the 3-card shape is never broken (on realistic, fully-populated matrices)', () => {
  const lightProgress = fullMatrix({ Percentages: 'practicing', 'Profit & Loss': 'learning' });
  const barelyStarted = fullMatrix({ Percentages: 'learning' });

  it('always produces exactly 3 cards once non-fresh', () => {
    expect(computePrepInsight({ ...BASE, matrix: lightProgress }).cards.length).toBe(3);
    expect(computePrepInsight({ ...BASE, matrix: barelyStarted }).cards.length).toBe(3);
  });

  it('the last card is always a strength — never all-red', () => {
    expect(computePrepInsight({ ...BASE, matrix: lightProgress }).cards[2].polarity).toBe('strength');
    expect(computePrepInsight({ ...BASE, matrix: barelyStarted }).cards[2].polarity).toBe('strength');
  });

  it('a heavily-touched, well-sequenced matrix still yields exactly 3 cards', () => {
    const advanced = fullMatrix({
      'Reading Comprehension': 'revising', 'Para Jumbles': 'practicing', 'Para Summary': 'practicing',
      Percentages: 'revising', 'Profit & Loss': 'practicing', 'Ratio & Proportion': 'revising',
      Tables: 'practicing', Charts: 'practicing', Arrangements: 'revising',
      'Full Length Mocks': 'practicing', 'Error Log': 'practicing', 'Mock Analysis': 'practicing',
    });
    const r = computePrepInsight({ ...BASE, matrix: advanced });
    expect(r.cards.length).toBe(3);
    expect(r.cards[2].polarity).toBe('strength');
  });
});

describe('weighted coverage — the number that replaces topic count', () => {
  it('sums to ~100 across done/in-progress/untouched', () => {
    const r = computePrepInsight({ ...BASE, matrix: fullMatrix({ Percentages: 'practicing', 'Profit & Loss': 'learning' }) });
    const total = r.weightedCoverage.donePct + r.weightedCoverage.inProgressPct + r.weightedCoverage.untouchedPct;
    expect(total).toBeGreaterThanOrEqual(98);
    expect(total).toBeLessThanOrEqual(102);
  });

  it('is driven by MARKS weight, not topic count — one heavy finished topic can outweigh many light untouched ones', () => {
    // Reading Comprehension is VARC's single heaviest topic (weightage 5);
    // Vocabulary and Grammar are both weightage 1.
    const r = computePrepInsight({ ...BASE, matrix: fullMatrix({ 'Reading Comprehension': 'practicing' }) });
    // Only 1 of 46 topics done by count (~2%), but RC alone is 5 of the
    // roughly-130-point total, so the weighted number must clear that.
    expect(r.weightedCoverage.donePct).toBeGreaterThan(2);
  });
});

describe('date arithmetic — reuses the real study-pace engine, not a guess', () => {
  it('fires as a RISK when the committed pace cannot make the date', () => {
    // Wide open syllabus (only one topic even started), 7 days out, 1h/day —
    // nowhere close to enough for ~390 remaining hours.
    const r = computePrepInsight({
      ...BASE,
      matrix: fullMatrix({ Percentages: 'learning' }),
      ambitionDate: '2026-08-20',
      selfStudyHours: 1,
    });
    const dateCard = r.cards.find((c) => c.key === 'date-arithmetic');
    expect(dateCard).toBeTruthy();
    expect(dateCard!.polarity).toBe('risk');
  });

  it('fires as a STRENGTH when the student has plenty of runway', () => {
    const r = computePrepInsight({
      ...BASE,
      matrix: fullMatrix({ Percentages: 'learning' }),
      ambitionDate: '2027-08-13', // a year out
      selfStudyHours: 6,
    });
    const ahead = r.cards.find((c) => c.key === 'ahead-of-pace');
    expect(ahead).toBeTruthy();
    expect(ahead!.polarity).toBe('strength');
  });

  it('never fires at all when the date or hours are missing (the onboarding-modal call site, pre finish-date screen)', () => {
    const r = computePrepInsight({ ...BASE, matrix: fullMatrix({ Percentages: 'learning' }), ambitionDate: null, selfStudyHours: null });
    expect(r.cards.some((c) => c.key === 'date-arithmetic' || c.key === 'ahead-of-pace' || c.key === 'on-pace')).toBe(false);
  });
});

describe('prerequisite gap — deterministic off the topic graph itself', () => {
  it('fires when a topic is in progress but its prerequisite is untouched', () => {
    // Functions requires Quadratic Equations (topics-constants.ts).
    const r = computePrepInsight({ ...BASE, matrix: fullMatrix({ Functions: 'practicing' }) });
    const card = r.cards.find((c) => c.key === 'prereq-gap');
    expect(card).toBeTruthy();
    expect(card!.headline).toContain('Functions');
    expect((card!.stats ?? []).join(' ')).toContain('Quadratic Equations');
  });

  it('does not fire when the WHOLE prerequisite chain is handled', () => {
    // Functions needs Quadratic Equations, which itself needs Linear
    // Equations — all three must be handled or the detector correctly finds
    // the next link in the chain instead.
    const r = computePrepInsight({
      ...BASE,
      matrix: fullMatrix({ Functions: 'practicing', 'Quadratic Equations': 'revising', 'Linear Equations': 'revising' }),
    });
    expect(r.cards.find((c) => c.key === 'prereq-gap')).toBeUndefined();
  });

  it('a clean, properly-sequenced start never trips the prereq detector', () => {
    const r = computePrepInsight({
      ...BASE,
      matrix: fullMatrix({
        'Linear Equations': 'practicing', 'Quadratic Equations': 'learning',
        Percentages: 'revising', 'Profit & Loss': 'practicing', 'Ratio & Proportion': 'learning',
      }),
    });
    expect(r.cards.find((c) => c.key === 'prereq-gap')).toBeUndefined();
  });
});

describe('repeater-specific detector never claims knowledge we do not have', () => {
  it('only fires for repeaters', () => {
    const matrix = fullMatrix({ Percentages: 'practicing' }); // VARC left entirely untouched
    const asFresher = computePrepInsight({ ...BASE, matrix, isRepeater: false });
    expect(asFresher.cards.find((c) => c.key === 'repeater-concentration')).toBeUndefined();
  });

  it('never claims the pattern repeats "last year" — we only have a percentile, not last year\'s topic map', () => {
    const matrix = fullMatrix({ Percentages: 'practicing' });
    const r = computePrepInsight({ ...BASE, matrix, isRepeater: true, lastYearPercentile: 82 });
    const card = r.cards.find((c) => c.key === 'repeater-concentration');
    if (card) {
      expect(card.headline.toLowerCase()).not.toContain('again');
      expect((card.note ?? '').toLowerCase()).not.toContain('last year');
    }
  });
});

describe('synthesis line — short, derived from the top real findings', () => {
  it('never exceeds a short line — no paragraph smuggled back in', () => {
    const matrix = fullMatrix({ Functions: 'practicing' });
    const r = computePrepInsight({ ...BASE, matrix, ambitionDate: '2026-08-15', selfStudyHours: 1 });
    if (r.synthesis) expect(r.synthesis.length).toBeLessThan(150);
  });

  it('is null only when nothing risk/pattern actually fired', () => {
    const matrix = fullMatrix({ Percentages: 'learning' });
    const r = computePrepInsight({ ...BASE, matrix });
    const hadRiskOrPattern = r.cards.some((c) => c.polarity !== 'strength');
    expect(r.synthesis == null).toBe(!hadRiskOrPattern);
  });
});

describe('never crashes on hostile input', () => {
  it('a topic name not in TOPIC_METADATA is silently ignored, not a crash', () => {
    expect(() => computePrepInsight({ ...BASE, matrix: [{ section: 'MOCKS', topic: 'Error Log', status: 'not_started' }] })).not.toThrow();
  });

  it('duplicate rows for the same topic do not crash the engine', () => {
    expect(() => computePrepInsight({
      ...BASE,
      matrix: [...fullMatrix({ Percentages: 'practicing' }), { section: 'QA', topic: 'Percentages', status: 'not_started' }],
    })).not.toThrow();
  });

  it('an invalid ISO date does not crash the pace calculation', () => {
    expect(() => computePrepInsight({
      ...BASE, matrix: fullMatrix({ Percentages: 'learning' }), ambitionDate: 'not-a-date', selfStudyHours: 3,
    })).not.toThrow();
  });
});
