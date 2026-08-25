import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { repOutcomes, MIN_SAMPLE_FOR_RATE, type LedgerRow } from './student-success-mis';

// ── Two reps make the aggregate the wrong shape ─────────────────────────────
//
// With one rep, aggregate outcomes were enough. With two, they cannot tell you
// whether rep A's students came back and rep B's did not — the entire question
// two hires exist to answer.
//
// These tests protect the things that would turn a useful view into a
// scoreboard: ordering, invented rates, and activity creeping up the page.

const led = (repId: string, n: number, o: Partial<LedgerRow> = {}): LedgerRow[] =>
  Array.from({ length: n }, (_, i) => ({
    studentId: `${repId}-s${i}`, repId, lane: 'going_cold', reasonCategory: null,
    loggedD3: true, loggedD7: true, ...o,
  } as LedgerRow));

describe('attribution is by rep_id, and nothing bleeds across reps', () => {
  it('splits students and calls by the rep who made them', () => {
    const rows = repOutcomes([...led('a', 5), ...led('b', 3)],
      { names: new Map([['a', 'Asha'], ['b', 'Bhavna']]) });
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.repId === 'a')!.studentsContacted).toBe(5);
    expect(rows.find((r) => r.repId === 'b')!.studentsContacted).toBe(3);
  });

  it('counts DISTINCT students, not calls', () => {
    // Three calls to one student is one student helped, not three.
    const rows = repOutcomes([
      ...led('a', 1), ...led('a', 1), ...led('a', 1),
    ].map((r) => ({ ...r, studentId: 'same-student' })), {});
    expect(rows[0].studentsContacted).toBe(1);
    expect(rows[0].callsLogged).toBe(3);
  });

  it('a rep with no display name renders as their id, never blank', () => {
    const rows = repOutcomes(led('unnamed-rep', 2), {});
    expect(rows[0].name).toBe('unnamed-rep');
  });
});

describe('NOT a leaderboard', () => {
  it('orders reps by NAME, never by any outcome', () => {
    // A sorted-by-performance list is a ranking; a ranking is a target; a
    // target gets gamed. Zara has perfect outcomes and still sorts last.
    const rows = repOutcomes([
      ...led('z', 30, { loggedD3: true, loggedD7: true }),
      ...led('a', 30, { loggedD3: false, loggedD7: false }),
    ], { names: new Map([['z', 'Zara'], ['a', 'Asha']]) });
    expect(rows.map((r) => r.name)).toEqual(['Asha', 'Zara']);
  });

  it('exposes no rank, score, target or quota field', () => {
    const rows = repOutcomes(led('a', 5), {});
    for (const key of Object.keys(rows[0])) {
      expect(key).not.toMatch(/rank|score|target|quota|position|percentile/i);
    }
  });
});

describe('a rate is never manufactured below the sample floor', () => {
  it('a thin rep shows counts and UNAVAILABLE, not a flattering percentage', () => {
    const rows = repOutcomes(led('a', 3, { loggedD3: true, loggedD7: true }), {});
    expect(rows[0].loggedD3.count).toBe(3);
    expect(rows[0].loggedD3.rate).toBeNull();
    expect(rows[0].loggedD3.evidence).toBe('UNAVAILABLE');
    // 3 of 3 would render as "100%" — the most misleading number available.
  });

  it('a rep at the floor gets a rate', () => {
    const rows = repOutcomes([
      ...led('a', MIN_SAMPLE_FOR_RATE / 2, { loggedD3: true }),
      ...led('a', MIN_SAMPLE_FOR_RATE / 2, { loggedD3: false }),
    ], {});
    expect(rows[0].loggedD3.rate).toBeCloseTo(0.5);
  });

  it('reuses the SAME floor as the rest of the founder view', () => {
    // One choke point. A second floor here would let two screens disagree
    // about whether the same number is trustworthy.
    const lib = readFileSync('src/lib/student-success-mis.ts', 'utf8');
    const fn = lib.slice(lib.indexOf('export function repOutcomes'));
    expect(fn).not.toMatch(/MIN_[A-Z_]*=\s*\d/);
    expect(fn).toMatch(/measure\(/);
  });
});

describe('unmeasured is not failure, and unmeasurable is not zero', () => {
  it('an intervention still inside its window is awaiting, not a miss', () => {
    const rows = repOutcomes([
      ...led('a', 20, { loggedD7: true }),
      ...led('a', 10, { loggedD3: null, loggedD7: null }),
    ], {});
    expect(rows[0].awaitingOutcome).toBe(10);
    expect(rows[0].loggedD7.of).toBe(20);   // denominator excludes the unmeasured
    expect(rows[0].loggedD7.rate).toBe(1);  // NOT 20/30
  });

  it('unmeasured sessions are null, never 0', () => {
    // Zero delivered sessions is a verdict; "we did not measure" is not.
    const rows = repOutcomes(led('a', 5), {});
    expect(rows[0].sessionsCompleted).toBeNull();
  });

  it('a measured zero is preserved as zero', () => {
    const rows = repOutcomes(led('a', 5), { sessionsByRep: new Map([['a', 0]]) });
    expect(rows[0].sessionsCompleted).toBe(0);
  });
});

describe('activity is present but demoted', () => {
  it('callsLogged is the LAST field on the shape', () => {
    // Order in the interface mirrors order on the page: outcomes first,
    // throughput last.
    const rows = repOutcomes(led('a', 4), {});
    expect(Object.keys(rows[0]).at(-1)).toBe('callsLogged');
  });

  it('an empty ledger produces no rows rather than an empty scoreboard', () => {
    expect(repOutcomes([], {})).toEqual([]);
  });
});

describe('the section renders and stays honest', () => {
  const VIEW = readFileSync('src/app/admin/student-success/mis-view.tsx', 'utf8');

  it('says out loud that it is ordered by name', () => {
    expect(VIEW).toMatch(/ordered by name, never by outcome/i);
  });

  it('carries the associated-not-caused caveat, naming both reasons', () => {
    expect(VIEW).toMatch(/ASSOCIATED, not caused/);
    expect(VIEW).toMatch(/choose whom to contact/i);
    expect(VIEW).toMatch(/lane-matched comparison arm is not yet instrumented/i);
  });

  it('says completed sessions were delivered by a mentor, not the rep', () => {
    expect(VIEW).toMatch(/delivered by a mentor, not by the rep/i);
  });

  it('labels sessions as delivered, not booked', () => {
    expect(VIEW).toMatch(/delivered, not booked/i);
  });

  it('frames calls as planning only', () => {
    expect(VIEW).toMatch(/For planning only/);
  });
});
