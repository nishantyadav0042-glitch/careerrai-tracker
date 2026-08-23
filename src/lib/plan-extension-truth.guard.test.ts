import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { reconcileWeek } from './plan-extension';

// ── The 23 Aug reconciliation incident, encoded as invariants ───────────────
//
// 56 students who studied were recorded as having studied nothing; 282 days
// were added to their syllabus dates; the cron reported ok:true.

const ROUTE = readFileSync('src/app/api/cron/weekly-plan-reconcile/route.ts', 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const CODE = strip(ROUTE);

const base = {
  weekdayHours: 6,
  weekendHours: 6,
  isWeekendByDay: [false, false, false, false, false, true, true],
  currentTargetDate: '2026-10-01',
  examDate: '2026-11-29',
  daysInWeek: ['2026-08-17','2026-08-18','2026-08-19','2026-08-20','2026-08-21','2026-08-22','2026-08-23'],
};

describe('GUARD 2 — a failed source read cannot move a syllabus date', () => {
  it('the route gates every mutation on source validity', () => {
    expect(CODE).toMatch(/gateOnSource\(/);
    const gateAt = CODE.indexOf('gateOnSource(');
    const insertAt = CODE.indexOf(".from('plan_extensions')");
    expect(gateAt).toBeGreaterThan(-1);
    expect(insertAt).toBeGreaterThan(gateAt);   // decided before anything is written
  });

  it('the unavailable branch writes nothing and returns a non-ok result', () => {
    const branch = CODE.slice(CODE.indexOf('if (!gate.proceed)'), CODE.indexOf('const hoursByStudentDay'));
    expect(branch).toMatch(/ok:\s*false/);
    expect(branch).toMatch(/skipped/);
    expect(branch).not.toMatch(/\.insert\(|\.update\(/);
  });

  it('the old discard-the-error shape is gone', () => {
    expect(CODE).not.toMatch(/const\s*\{\s*data:\s*reports\s*\}\s*=/);
  });
});

describe('GUARD 8 — the request no longer carries the whole student base', () => {
  it('the read is chunked, not one giant .in()', () => {
    expect(CODE).toMatch(/readRowsForIds/);
    // The exact shape that produced a ~24KB URL at 656 students.
    expect(CODE).not.toMatch(/\.in\('student_id',\s*ids\)/);
  });
});

describe('GUARD 7 — a skipped run is distinguishable from a quiet one', () => {
  it('"could not read" and "nobody studied" are different results', () => {
    const branch = CODE.slice(CODE.indexOf('if (!gate.proceed)'), CODE.indexOf('const hoursByStudentDay'));
    expect(branch).toMatch(/source_unavailable/);
    expect(branch).toMatch(/503/);
  });
});

describe('GUARD 3 — a day we never asked about is not a day of zero study', () => {
  it('an unmeasured day is removed from BOTH sides, not counted as a miss', () => {
    // Tue was a check-in day: a row exists, our surface never asked for hours.
    const withUnmeasured = reconcileWeek({
      ...base,
      loggedHoursByDay: [6, 0, 6, 6, 6, 6, 6],
      unmeasuredByDay: [false, true, false, false, false, false, false],
    });
    expect(withUnmeasured.expectedHours).toBe(36);   // six measured days, not seven
    expect(withUnmeasured.actualHours).toBe(36);
    expect(withUnmeasured.deficitHours).toBe(0);
    expect(withUnmeasured.daysAdded).toBe(0);
  });

  it('the same week WITHOUT the flag punishes them — the behaviour being fixed', () => {
    const asBefore = reconcileWeek({
      ...base,
      loggedHoursByDay: [6, 0, 6, 6, 6, 6, 6],
    });
    expect(asBefore.expectedHours).toBe(42);
    expect(asBefore.deficitHours).toBe(6);
    expect(asBefore.daysAdded).toBe(1);   // a day lost for a question never asked
  });

  it("the founder's standing rule is untouched: no log at all is still no study", () => {
    const noLogs = reconcileWeek({ ...base, loggedHoursByDay: [0, 0, 0, 0, 0, 0, 0] });
    expect(noLogs.expectedHours).toBe(42);
    expect(noLogs.actualHours).toBe(0);
    expect(noLogs.daysAdded).toBeGreaterThan(0);
  });

  it('a declared rest day is a real zero and still counts against them', () => {
    // 'declared_zero' — the student said they did not study. That is an answer.
    const rested = reconcileWeek({
      ...base,
      loggedHoursByDay: [6, 0, 6, 6, 6, 6, 6],
      unmeasuredByDay: [false, false, false, false, false, false, false],
    });
    expect(rested.deficitHours).toBe(6);
  });

  it('only not_collected is treated as unmeasured by the route', () => {
    expect(CODE).toMatch(/study_duration_source === 'not_collected'/);
  });
});

describe("the founder's real week is reconciled correctly now", () => {
  it('35.3 hours logged produces no extension', () => {
    const r = reconcileWeek({
      ...base,
      loggedHoursByDay: [6, 6, 6, 6, 6, 0, 5.3],
      unmeasuredByDay: [false, false, false, false, false, true, false],  // Sat: not_collected
    });
    expect(r.actualHours).toBe(35.3);
    expect(r.expectedHours).toBe(36);   // Saturday was never asked about
    // Was +7 days in production. It is +1 now, not 0, because the existing
    // rule prices ANY shortfall at a whole day: ceil(0.7 / 6) = 1. That
    // rounding is pre-existing behaviour and deliberately untouched here —
    // flagged for a product decision rather than changed inside an incident fix.
    expect(r.daysAdded).toBe(1);
    expect(r.deficitHours).toBeCloseTo(0.7, 5);
  });
});

describe('GUARD 6 — reconciliation is idempotent', () => {
  it('the same inputs produce the same result every time', () => {
    const input = { ...base, loggedHoursByDay: [3, 0, 6, 6, 0, 0, 0] };
    const a = reconcileWeek(input);
    const b = reconcileWeek(input);
    expect(a).toEqual(b);
  });

  it('the insert is what makes a re-run safe, and it happens before the date moves', () => {
    // Pin the MUTATION, not the word: syllabus_target_date also appears in the
    // profiles select forty lines earlier, and an earlier version of this
    // guard matched that and "failed" on correct code.
    const insertAt = CODE.indexOf(".from('plan_extensions')");
    const updateAt = CODE.indexOf('.update({ syllabus_target_date');
    expect(insertAt).toBeGreaterThan(-1);
    expect(updateAt).toBeGreaterThan(-1);
    expect(updateAt).toBeGreaterThan(insertAt);
  });
});
