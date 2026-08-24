import { describe, it, expect } from 'vitest';
import * as MIS from './student-success-mis';
import {
  measure, returnPicture, compareByLane, interventionPicture, conversionPicture,
  learningPicture, reachPicture, MIN_SAMPLE_FOR_RATE, MIN_PER_ARM_FOR_COMPARISON,
  type ReturnRow, type LedgerRow, type UnreachedRow,
} from './student-success-mis';

// ── The founder is about to argue a funding case from these screens ─────────
//
// Every test here exists to stop one specific lie: a percentage computed from
// four students, a "0% completion" that is really "no sample", a cohort
// comparison across different cohort ages (which already produced a fictitious
// activation collapse once), or the word "caused" appearing anywhere near a
// rep's name.

describe('a number the sample cannot support is never rendered as a number', () => {
  it('refuses a rate below the minimum sample', () => {
    const m = measure('x', 3, 5);
    expect(m.rate).toBeNull();
    expect(m.evidence).toBe('UNAVAILABLE');
    expect(m.note).toMatch(/too few/i);
  });

  it('still reports the COUNT, because a count is a fact at any size', () => {
    const m = measure('x', 3, 5);
    expect(m.count).toBe(3);
    expect(m.of).toBe(5);
  });

  it('gives a rate once the sample is big enough', () => {
    const m = measure('x', 10, MIN_SAMPLE_FOR_RATE);
    expect(m.rate).toBeCloseTo(0.5);
    expect(m.evidence).toBe('FACT');
  });

  it('never returns NaN or Infinity for an empty denominator', () => {
    const m = measure('x', 0, 0);
    expect(m.rate).toBeNull();
    expect(Number.isFinite(m.rate as number)).toBe(false);
  });
});

describe('return is measured cohort-correctly', () => {
  const row = (o: Partial<ReturnRow>): ReturnRow => ({
    studentId: Math.random().toString(36), tenureDays: 30, logDays: 1,
    d1: true, d3: true, d7: true, ...o,
  });

  it('a student too new for a window is not counted as a failure in it', () => {
    // THE RECORDED MISTAKE: comparing "ever logged %" across cohorts of
    // different ages produced a 42.9% -> 18.9% activation "collapse" that did
    // not exist. Measured correctly it was flat.
    const rows = [
      ...Array.from({ length: 25 }, () => row({ d7: true })),
      // 25 signed up yesterday: due for nothing.
      ...Array.from({ length: 25 }, () => row({ tenureDays: 1, d1: null, d3: null, d7: null })),
    ];
    const p = returnPicture(rows);
    expect(p.d7.of).toBe(25);          // only the eligible 25
    expect(p.d7.rate).toBe(1);         // NOT 0.5
  });

  it('answers UNKNOWN when no student is old enough yet', () => {
    const p = returnPicture(Array.from({ length: 30 }, () => row({ d7: null })));
    expect(p.d7.evidence).toBe('UNKNOWN');
    expect(p.d7.rate).toBeNull();
    expect(p.d7.note).toMatch(/old enough/i);
  });

  it('eligible counts everyone, activation counts anyone who ever logged', () => {
    const rows = [
      ...Array.from({ length: 20 }, () => row({ logDays: 3 })),
      ...Array.from({ length: 30 }, () => row({ logDays: 0 })),
    ];
    const p = returnPicture(rows);
    expect(p.eligible).toBe(50);
    expect(p.activated.count).toBe(20);
    expect(p.activated.rate).toBeCloseTo(0.4);
  });
});

describe('intervention effect is lane-matched and never causal', () => {
  const led = (lane: string, logged: boolean | null, i: number): LedgerRow => ({
    studentId: `s${lane}${i}`, lane, reasonCategory: null,
    loggedD3: logged, loggedD7: logged, repId: 'rep-1',
  });
  const un = (lane: string, logged: boolean | null, i: number): UnreachedRow => ({
    studentId: `u${lane}${i}`, lane, loggedD3: logged,
  });

  it('a thin arm produces UNAVAILABLE, not a flattering percentage', () => {
    const cmp = compareByLane(
      [led('going_cold', true, 1), led('going_cold', true, 2)],
      Array.from({ length: 50 }, (_, i) => un('going_cold', false, i)),
    );
    expect(cmp[0].evidence).toBe('UNAVAILABLE');
    expect(cmp[0].reachedRate).toBeNull();
    expect(cmp[0].differencePoints).toBeNull();
    // 2 contacted, both logged, against 50 who did not: the tempting reading is
    // "100% vs 0%, the reps are miraculous". It must not be available.
    expect(cmp[0].reached).toBe(2);
  });

  it('with both arms populated it reports ASSOCIATED — never caused', () => {
    const cmp = compareByLane(
      Array.from({ length: 20 }, (_, i) => led('going_cold', i < 10, i)),
      Array.from({ length: 20 }, (_, i) => un('going_cold', i < 4, i)),
    );
    expect(cmp[0].evidence).toBe('ASSOCIATED');
    expect(cmp[0].reachedRate).toBeCloseTo(0.5);
    expect(cmp[0].unreachedRate).toBeCloseTo(0.2);
    expect(cmp[0].differencePoints).toBeCloseTo(30);
    expect(cmp[0].note).toMatch(/not evidence that the call caused/i);
  });

  it('the word "caused" appears in no note this module produces', () => {
    const cmp = compareByLane(
      Array.from({ length: 20 }, (_, i) => led('fresh', true, i)),
      Array.from({ length: 20 }, (_, i) => un('fresh', false, i)),
    );
    for (const c of cmp) {
      expect(c.note ?? '').not.toMatch(/\bcaused the\b(?! difference)/i);
      expect(c.evidence).not.toBe('FACT'); // a comparison is never a FACT
    }
  });

  it('compares only within a lane, never across them', () => {
    // Reps work the students most likely to respond. Across lanes this
    // measures their TARGETING, not their effect.
    const cmp = compareByLane(
      [...Array.from({ length: 15 }, (_, i) => led('going_cold', true, i)),
       ...Array.from({ length: 15 }, (_, i) => led('conversion', false, i))],
      [...Array.from({ length: 15 }, (_, i) => un('going_cold', false, i)),
       ...Array.from({ length: 15 }, (_, i) => un('conversion', true, i))],
    );
    expect(cmp.map((c) => c.lane).sort()).toEqual(['conversion', 'going_cold']);
    const cold = cmp.find((c) => c.lane === 'going_cold')!;
    expect(cold.reached).toBe(15);
    expect(cold.unreached).toBe(15);
  });

  it('unmeasured interventions are counted as awaiting, not as failures', () => {
    const p = interventionPicture(
      [...Array.from({ length: 20 }, (_, i) => led('fresh', true, i)),
       ...Array.from({ length: 10 }, (_, i) => ({ ...led('fresh', null, 100 + i) }))],
      [],
    );
    expect(p.interventions).toBe(30);
    expect(p.awaitingOutcome).toBe(10);
    expect(p.loggedD7.of).toBe(20);   // denominator excludes the unmeasured
    expect(p.loggedD7.rate).toBe(1);  // NOT 20/30
  });
});

describe('a booking is not a conversion', () => {
  const s = (status: string, started = false, ended = false) => ({
    session_status: status,
    started_at: started ? '2026-08-20T10:00:00Z' : null,
    ended_at: ended ? '2026-08-20T11:00:00Z' : null,
  });

  it('TODAY: 9 expired + 7 cancelled reports neverDelivered', () => {
    const p = conversionPicture([
      ...Array(9).fill(s('expired')), ...Array(7).fill(s('cancelled')),
    ]);
    expect(p.completed).toBe(0);
    expect(p.neverDelivered).toBe(true);
    expect(p.settled).toBe(16);
  });

  it('a scheduled session is not counted as a failed one', () => {
    const p = conversionPicture([
      s('scheduled'), s('scheduled'), ...Array(9).fill(s('expired')),
      ...Array(7).fill(s('cancelled')),
    ]);
    expect(p.created).toBe(18);
    expect(p.settled).toBe(16);
  });

  it('distinguishes completed-with-start from completed-start-unknown', () => {
    const p = conversionPicture([s('completed', true, true), s('completed', false, true)]);
    expect(p.completedWithObservedStart).toBe(1);
    expect(p.completedStartUnknown).toBe(1);
  });

  it('a tiny sample yields UNAVAILABLE, not a 0% headline', () => {
    const p = conversionPicture([s('expired'), s('cancelled')]);
    expect(p.completion.rate).toBeNull();
    expect(p.completion.evidence).toBe('UNAVAILABLE');
  });
});

describe('learning is aggregated, and its own thinness is reported', () => {
  const l = (reason: LedgerRow['reasonCategory'], i: number): LedgerRow => ({
    studentId: `s${i}`, lane: 'fresh', reasonCategory: reason,
    loggedD3: null, loggedD7: null, repId: 'rep-1',
  });

  it('ranks reasons and flags the ones the PRODUCT can fix', () => {
    const p = learningPicture([
      ...Array.from({ length: 12 }, (_, i) => l('coaching_timetable_conflict', i)),
      ...Array.from({ length: 9 }, (_, i) => l('exam_far_away', 100 + i)),
    ]);
    expect(p.top[0].reason).toBe('coaching_timetable_conflict');
    expect(p.top[0].count).toBe(12);
    expect(p.top[0].productFixable).toBe(true);
    // "the exam is far away" is a fact about the student, not a product defect.
    expect(p.top[1].productFixable).toBe(false);
    expect(p.productFixableCount).toBe(12);
  });

  it('reports capture discipline — a ledger nobody fills teaches nothing', () => {
    const p = learningPicture([
      ...Array.from({ length: 10 }, (_, i) => l('no_time', i)),
      ...Array.from({ length: 30 }, (_, i) => l(null, 100 + i)),
    ]);
    expect(p.withReason).toBe(10);
    expect(p.withoutReason).toBe(30);
    expect(p.capture.rate).toBeCloseTo(0.25);
  });

  it('a handful of reasons is not a "top reason"', () => {
    const p = learningPicture([l('price', 1), l('no_time', 2)]);
    expect(p.readable).toBe(false);
  });

  it('an empty ledger produces no reasons and no crash', () => {
    const p = learningPicture([]);
    expect(p.top).toEqual([]);
    expect(p.capture.rate).toBeNull();
    expect(p.readable).toBe(false);
  });
});

describe('reachability names the students only a human can reach', () => {
  it('separates push, phone-only and genuinely unreachable', () => {
    const p = reachPicture([
      ...Array.from({ length: 152 }, () => ({ hasPush: true, hasPhone: true })),
      ...Array.from({ length: 611 }, () => ({ hasPush: false, hasPhone: true })),
      ...Array.from({ length: 48 }, () => ({ hasPush: false, hasPhone: false })),
    ]);
    expect(p.students).toBe(811);
    expect(p.withPush).toBe(152);
    // The number that justifies a rep existing: no push, but a phone.
    expect(p.humanIsOnlyChannel).toBe(611);
    expect(p.unreachable).toBe(48);
    expect(p.pushReach.rate).toBeCloseTo(152 / 811, 3);
  });

  it('the three groups always account for everyone', () => {
    const p = reachPicture([
      { hasPush: true, hasPhone: false }, { hasPush: false, hasPhone: true },
      { hasPush: false, hasPhone: false },
    ]);
    expect(p.withPush + p.withPhoneOnly + p.unreachable).toBe(p.students);
  });
});

describe('this module introduces no competing authority', () => {
  it('exports no score, rank, priority or formula', () => {
    // Standing constraint: no second scoring system, no priority engine.
    for (const name of Object.keys(MIS)) {
      expect(name).not.toMatch(/score|rank|priority|formula|predict/i);
    }
  });
});
