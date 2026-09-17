import { describe, it, expect } from 'vitest';
import { readRetention, type ReadoutLog } from './retention-readout';
import { BASELINE } from './retention-baseline';

// The readout's only job is to be comparable to the frozen baseline. These
// tests are about the ways a retention number lies: an incomplete observation
// window read as a failure, an empty row counted as preparation, a cohort cut
// one day differently from the one it is being compared against.

const ASOF = '2026-09-16';
const d = (n: number) => new Date(Date.parse(ASOF) - n * 86_400_000).toISOString().slice(0, 10);

/** A studied day by default — day_outcome is what makes it meaningful. */
const log = (student_id: string, daysAgo: number, o: Partial<ReadoutLog> = {}): ReadoutLog =>
  ({ student_id, report_date: d(daysAgo), day_outcome: 'studied', study_duration: 1, ...o });

describe('an incomplete window is never read as a failure', () => {
  it('ignores a log whose 7-day tail has not elapsed', () => {
    // Yesterday's log cannot yet have failed to be followed within 7 days.
    // Counting it as a miss is the easiest way to manufacture a decline.
    const r = readRetention([log('a', 1)], { asOf: ASOF });
    expect(r.repeatWithin7d.n).toBe(0);
    expect(r.repeatWithin7d.pct).toBeNull();
  });

  it('admits a log exactly at the closed-tail boundary', () => {
    expect(readRetention([log('a', 8)], { asOf: ASOF }).repeatWithin7d.n).toBe(1);
    expect(readRetention([log('a', 7)], { asOf: ASOF }).repeatWithin7d.n).toBe(0);
  });

  it('uses the same 30-day span the baseline was measured over', () => {
    // Baseline: report_date between current_date - 37 and current_date - 8.
    expect(readRetention([log('a', 37)], { asOf: ASOF }).repeatWithin7d.n).toBe(1);
    expect(readRetention([log('a', 38)], { asOf: ASOF }).repeatWithin7d.n).toBe(0);
  });

  it('reports null rather than 0% when nothing qualifies', () => {
    // 0% and "no data" are different answers and only one of them is a signal.
    const r = readRetention([], { asOf: ASOF });
    expect(r.repeatWithin7d.pct).toBeNull();
    expect(r.secondLogWithin7d.pct).toBeNull();
  });
});

describe('repeat within 7 days', () => {
  it('counts a student who came back inside the window', () => {
    const r = readRetention([log('a', 20), log('a', 15)], { asOf: ASOF });
    expect(r.repeatWithin7d.hits).toBe(1);
    expect(r.repeatWithin7d.n).toBe(2);
    expect(r.repeatWithin7d.pct).toBe(50);
  });

  it('does not count a return that arrived on the 8th day', () => {
    expect(readRetention([log('a', 20), log('a', 12)], { asOf: ASOF }).repeatWithin7d.hits).toBe(0);
  });

  it('counts the same calendar day only once', () => {
    const dup = [log('a', 20), log('a', 20), log('a', 16)];
    expect(readRetention(dup, { asOf: ASOF }).repeatWithin7d.n).toBe(2);
  });
});

describe('meaningful is stricter than present', () => {
  it('a return that carried no preparation does not count as meaningful', () => {
    // The whole point of the decision rule's strong/weak split: students
    // returning to write an empty row is an opening, not a preparation event.
    const logs = [log('a', 20), log('a', 15, { day_outcome: 'not_studied', study_duration: 0 })];
    const r = readRetention(logs, { asOf: ASOF });
    expect(r.repeatWithin7d.hits).toBe(1);
    expect(r.meaningfulRepeatWithin7d.hits).toBe(0);
  });

  it('a declared zero with real hours still counts', () => {
    const logs = [log('a', 20), log('a', 15, { day_outcome: null, study_duration: 2 })];
    expect(readRetention(logs, { asOf: ASOF }).meaningfulRepeatWithin7d.hits).toBe(1);
  });

  it('meaningful can never exceed the plain rate', () => {
    const logs = [log('a', 20), log('a', 15), log('b', 25), log('b', 22, { day_outcome: 'not_studied', study_duration: 0 })];
    const r = readRetention(logs, { asOf: ASOF });
    expect(r.meaningfulRepeatWithin7d.hits).toBeLessThanOrEqual(r.repeatWithin7d.hits);
  });
});

describe('the first-logger cohort', () => {
  it('counts a second log inside 7 days of the first', () => {
    const r = readRetention([log('a', 30), log('a', 26)], { asOf: ASOF });
    expect(r.secondLogWithin7d.hits).toBe(1);
    expect(r.secondLogWithin7d.n).toBe(1);
  });

  it('separates day-2 from the wider 7-day window', () => {
    const r = readRetention([log('a', 30), log('a', 29)], { asOf: ASOF });
    expect(r.day2Return.hits).toBe(1);
    const later = readRetention([log('b', 30), log('b', 25)], { asOf: ASOF });
    expect(later.day2Return.hits).toBe(0);
    expect(later.secondLogWithin7d.hits).toBe(1);
  });

  it('day-2 can never exceed the 7-day rate — they are nested', () => {
    const logs = [log('a', 30), log('a', 29), log('b', 28), log('b', 24), log('c', 27)];
    const r = readRetention(logs, { asOf: ASOF });
    expect(r.day2Return.hits).toBeLessThanOrEqual(r.secondLogWithin7d.hits);
  });

  it('one-and-done is the complement of ever returning', () => {
    const r = readRetention([log('a', 30), log('b', 30), log('b', 27)], { asOf: ASOF });
    expect(r.oneAndDone.hits).toBe(1);
    expect(r.oneAndDone.n).toBe(2);
  });

  it('counts new first-loggers including those whose tail is still open', () => {
    // Volume is a different question from outcome: a student who first logged
    // yesterday is real acquisition even though their return is unknown.
    expect(readRetention([log('a', 1)], { asOf: ASOF }).newFirstLoggers).toBe(1);
  });
});

describe('it answers the same questions the frozen baseline asked', () => {
  it('every baseline rate has a readout counterpart', () => {
    const r = readRetention([], { asOf: ASOF });
    for (const k of ['day2Return', 'secondLogWithin7d', 'repeatWithin7d', 'oneAndDone'] as const) {
      expect(r[k], `${k} must exist to be comparable`).toBeDefined();
    }
    // And the baseline still holds the numbers they will be compared against.
    expect(BASELINE.repeat_log_within_7d.value).toBe(59.2);
    expect(BASELINE.second_log_within_7d.value).toBe(36.1);
  });
});
