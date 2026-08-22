import { describe, it, expect } from 'vitest';
import {
  readMockEvidence,
  headlineEvidence,
  MIN_ATTEMPTS_FOR_RATIO,
  type MockRow,
  type EvidenceItem,
} from './mock-evidence';

// ── The Evidence Layer's contract, pinned to ideas rather than characters ───
//
// These tests exist because three plausible-sounding claims nearly shipped:
// "time sink" (unmeasurable — time is per section), "silly trap" (a ratio
// cannot name a cause), and "12 of 22" (we hold no section-size metadata).
// Each is now a standing invariant, asserted against the output of the real
// function rather than against the source text of the module.

const sec = (attempted: number | null, correct: number | null, extra = {}) => ({
  percentile: 80,
  attempted,
  correct,
  time_min: 40,
  ...extra,
});

const allInts = (s: string) => (s.match(/\d+/g) ?? []).map(Number);

describe('what the scorecard printed is stated as fact', () => {
  it('reports attempted, correct and the ratio between them', () => {
    const ev = readMockEvidence({ qa: sec(12, 12) });
    const fact = ev.items.find((i) => i.id === 'mock.attempts.qa')!;
    expect(fact.confidence).toBe('fact');
    expect(fact.data).toMatchObject({ attempted: 12, correct: 12, accuracy_pct: 100 });
    expect(fact.text).toContain('attempted 12');
    expect(ev.hasMeasuredAbility).toBe(true);
  });

  it('a section with attempted but no correct measures effort, not ability, and is dropped', () => {
    const ev = readMockEvidence({ qa: sec(20, null) });
    expect(ev.hasMeasuredAbility).toBe(false);
    expect(ev.items.every((i) => i.section !== 'qa')).toBe(true);
  });

  it('an impossible row (correct exceeds attempted) is not evidence', () => {
    const ev = readMockEvidence({ qa: sec(10, 14) });
    expect(ev.hasMeasuredAbility).toBe(false);
  });
});

describe('a percentile-only mock is a scoreboard, and says so', () => {
  it('names the absence instead of implying we measured ability', () => {
    const ev = readMockEvidence({ overall_percentile: 88, qa: { percentile: 80 } });
    expect(ev.hasMeasuredAbility).toBe(false);
    const unknown = ev.items.find((i) => i.confidence === 'unknown')!;
    expect(unknown.text).toMatch(/cannot tell you anything about your accuracy/i);
    expect(headlineEvidence(ev)).toBeNull();
  });
});

describe('an inference may never sound more certain than its evidence', () => {
  const hedged = /cannot|does not look|one possible|could be|whether/i;

  it('every inference hedges, in the sentence itself', () => {
    const rows: MockRow[] = [
      { qa: sec(20, 19), varc: sec(22, 20) },
      { qa: sec(20, 8), varc: sec(22, 20) },
      { qa: sec(6, 5), varc: sec(22, 20) },
    ];
    for (const row of rows) {
      const inferences = readMockEvidence(row).items.filter((i) => i.confidence === 'inference');
      expect(inferences.length).toBeGreaterThan(0);
      for (const i of inferences) expect(i.text).toMatch(hedged);
    }
  });

  it('low accuracy reports the ratio and refuses to name the cause', () => {
    const ev = readMockEvidence({ qa: sec(20, 8) });
    const inf = ev.items.find((i) => i.id === 'mock.accuracy_low.qa')!;
    expect(inf.text).toMatch(/cannot tell us why/i);
    // The three causes it must never pick between on section-level data.
    expect(inf.text).not.toMatch(/you (have|are) (a )?(careless|silly|conceptual)/i);
  });

  it('low attempt volume offers selection as a possibility, never a diagnosis', () => {
    const ev = readMockEvidence({ varc: sec(24, 18), qa: sec(10, 9) });
    const inf = ev.items.find((i) => i.id === 'mock.volume.low.qa')!;
    expect(inf.text).toMatch(/one possible reason/i);
    expect(inf.text).toMatch(/cannot tell us why/i);
    expect(inf.text).not.toMatch(/you have a (question.)?selection problem/i);
  });

  it('a handful of attempts is noise, and produces no ratio claim at all', () => {
    const ev = readMockEvidence({ qa: sec(MIN_ATTEMPTS_FOR_RATIO - 1, MIN_ATTEMPTS_FOR_RATIO - 1) });
    expect(ev.items.some((i) => i.id.startsWith('mock.accuracy'))).toBe(false);
    // The fact still stands — we just decline to interpret it.
    expect(ev.items.some((i) => i.id === 'mock.attempts.qa')).toBe(true);
  });
});

describe('the three claims the audit killed can never come back', () => {
  const everyItem = (): EvidenceItem[] =>
    [
      readMockEvidence({ qa: sec(20, 8), varc: sec(24, 22), dilr: sec(10, 9) }),
      readMockEvidence({ qa: sec(20, 19) }),
      readMockEvidence({ overall_percentile: 90 }),
    ].flatMap((e) => e.items);

  it('TIME SINK: time is stored per section, so no item may speak about time', () => {
    for (const i of everyItem()) {
      expect(i.text).not.toMatch(/minute|time_min|spent .* on|too long/i);
      expect(Object.keys(i.data)).not.toContain('time_min');
    }
  });

  it('INVENTED DENOMINATOR: every number shown to a student is in that item’s own data', () => {
    for (const i of everyItem()) {
      const shown = allInts(i.text);
      const known = Object.values(i.data).filter((v): v is number => typeof v === 'number');
      for (const n of shown) expect(known).toContain(n);
    }
  });

  it('NO PREDICTION: nothing forecasts a percentile, trajectory or outcome', () => {
    for (const i of everyItem()) {
      expect(i.text).not.toMatch(/on track|trajectory|you will|projected|expect(ed)? percentile/i);
    }
  });
});

describe('the system always says what it cannot see', () => {
  it('a measured mock still declares the granularity it lacks', () => {
    const ev = readMockEvidence({ qa: sec(20, 15) });
    const unknown = ev.items.find((i) => i.id === 'mock.unknown.granularity')!;
    expect(unknown.confidence).toBe('unknown');
    expect(unknown.text).toMatch(/which questions|how long any single question/i);
  });

  it('facts lead — a student is told what happened before what it might mean', () => {
    const ev = readMockEvidence({ qa: sec(20, 19) });
    expect(headlineEvidence(ev)!.confidence).toBe('fact');
  });
});
