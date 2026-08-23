import { describe, it, expect } from 'vitest';
import { trailingWindow, addStudyDays, isDayKey, inWindow } from './window';
import { loggedDaysLast7, loggedToday } from './daily-log';

// 0C.3 Wave 1. The bug this whole wave exists to kill:
//
//     const weekAgo = new Date(now.getTime() - 7 * 86_400_000)
//     …  .gte('report_date', weekAgo)     ← EIGHT inclusive days
//     …  `Studied ${daysStudied} of 7 days`
//
// Five files did that, and weekly-diagnosis could render "Studied 8 of 7
// days" to a paid mentor. The arithmetic below is the whole fix, so it is
// tested by counting, not by asserting the shape of the expression.

const TODAY = '2026-08-23';

describe('trailingWindow — seven, never eight (Constitution Article 1)', () => {
  it('spans exactly seven days, inclusive at both ends', () => {
    const w = trailingWindow(TODAY);
    expect(w.keys).toHaveLength(7);
    expect(w.start).toBe('2026-08-17');
    expect(w.end).toBe('2026-08-23');
  });

  it('EXCLUDES today−7 — the eighth day, and the entire bug', () => {
    const w = trailingWindow(TODAY);
    expect(inWindow(w, '2026-08-16')).toBe(false);
    expect(inWindow(w, '2026-08-17')).toBe(true);
    // Stated as the old code would have computed it, so a regression that
    // reintroduces `−7` fails here by name.
    const theOldWrongStart = addStudyDays(TODAY, -7);
    expect(theOldWrongStart).toBe('2026-08-16');
    expect(inWindow(w, theOldWrongStart)).toBe(false);
  });

  it('excludes tomorrow', () => {
    expect(inWindow(trailingWindow(TODAY), '2026-08-24')).toBe(false);
  });

  it('crosses a month boundary without losing or gaining a day', () => {
    const w = trailingWindow('2026-09-03');
    expect(w.keys).toHaveLength(7);
    expect(w.start).toBe('2026-08-28');
  });

  it('crosses a leap day', () => {
    const w = trailingWindow('2028-03-02');
    expect(w.keys).toContain('2028-02-29');
    expect(w.keys).toHaveLength(7);
  });

  it('refuses a non-day-key rather than inventing a window', () => {
    expect(() => trailingWindow('23-08-2026')).toThrow();
    expect(() => trailingWindow('2026-08-23T00:00:00Z')).toThrow();
    // Date would happily roll this into 3 March. A window built on an
    // impossible date is worse than no window.
    expect(isDayKey('2026-02-31')).toBe(false);
    expect(() => trailingWindow('2026-02-31')).toThrow();
  });
});

describe('logged_days_last_7', () => {
  const produce = (dates: string[], today = TODAY) =>
    loggedDaysLast7.produce({ reportDates: dates, today });

  it('counts the days in the window', () => {
    const r = produce(['2026-08-17', '2026-08-19', '2026-08-23']);
    expect(r.known && r.value).toBe(3);
  });

  it('a full week is 7 and cannot be 8', () => {
    const r = produce([...trailingWindow(TODAY).keys]);
    expect(r.known && r.value).toBe(7);
    expect(loggedDaysLast7.validRange).toEqual([0, 7]);
  });

  it('zero rows is KNOWN zero, not unknown', () => {
    // daily_reports is the complete record of submissions, so an absent row
    // IS the evidence. This is the one case where zero is a measurement --
    // see the producer's header for why that is not the J2 sleep-flag trap.
    const r = produce([]);
    expect(r.known).toBe(true);
    expect(r.known && r.value).toBe(0);
  });

  it('REFUSES an eight-day row set instead of silently trimming it', () => {
    // The exact payload the old callers produced. A producer that trimmed
    // would make the bug invisible again; this one makes it unshippable.
    const eightDays = [addStudyDays(TODAY, -7), ...trailingWindow(TODAY).keys];
    const r = produce(eightDays);
    expect(r.known).toBe(false);
    expect(r.known === false && r.reason).toBe('out_of_universe');
    expect(r.violations.join(' ')).toContain('2026-08-16');
    expect(r.violations.join(' ')).toContain("caller's window is wrong");
  });

  it('refuses a future-dated row', () => {
    const r = produce(['2026-08-23', '2026-08-24']);
    expect(r.known === false && r.reason).toBe('out_of_universe');
  });

  it('is UNKNOWN, never a number, when today is not a day key', () => {
    const r = produce(['2026-08-23'], 'yesterday');
    expect(r.known).toBe(false);
    expect(r.known === false && r.reason).toBe('invalid_input');
  });

  it('is UNKNOWN when a report_date is malformed', () => {
    const r = produce(['2026-08-23', '']);
    expect(r.known === false && r.reason).toBe('invalid_input');
  });

  it('counts a duplicated date once', () => {
    // UNIQUE (student_id, report_date) makes this impossible today. The fact
    // must not start double-counting if that constraint is ever relaxed.
    const r = produce(['2026-08-23', '2026-08-23', '2026-08-22']);
    expect(r.known && r.value).toBe(2);
  });

  it('carries provenance naming the canonical source', () => {
    const r = produce(['2026-08-23']);
    expect(r.provenance.factKey).toBe('logged_days_last_7');
    expect(r.provenance.source).toBe('dailyLogState');
  });
});

describe('logged_today', () => {
  const produce = (dates: string[], today = TODAY) =>
    loggedToday.produce({ reportDates: dates, today });

  it('true when today is present', () => {
    expect(produce(['2026-08-21', '2026-08-23']).known).toBe(true);
    const r = produce(['2026-08-23']);
    expect(r.known && r.value).toBe(true);
  });

  it('false when it is not — and false means "no submission", not "no study"', () => {
    const r = produce(['2026-08-22']);
    expect(r.known && r.value).toBe(false);
  });

  it('does not depend on row order', () => {
    // The tracker page used to read `logs[0].report_date === today`, correct
    // only while the query stayed ordered descending.
    const a = produce(['2026-08-23', '2026-08-18']);
    const b = produce(['2026-08-18', '2026-08-23']);
    expect(a.known && a.value).toBe(true);
    expect(b.known && b.value).toBe(true);
  });

  it('is UNKNOWN, never false, when today is not a day key', () => {
    const r = produce(['2026-08-23'], '');
    expect(r.known).toBe(false);
    expect(r.known === false && r.reason).toBe('invalid_input');
  });
});

describe('the two facts agree with each other on the same input', () => {
  it('logged_today true implies logged_days_last_7 >= 1', () => {
    const input = { reportDates: ['2026-08-23'], today: TODAY };
    const t = loggedToday.produce(input);
    const d = loggedDaysLast7.produce(input);
    expect(t.known && t.value).toBe(true);
    expect(d.known && d.value >= 1).toBe(true);
  });

  it('same input, same output, every time — the same-moment invariant', () => {
    const input = { reportDates: ['2026-08-19', '2026-08-23'], today: TODAY };
    const runs = Array.from({ length: 5 }, () => loggedDaysLast7.produce(input));
    for (const r of runs) expect(r.known && r.value).toBe(2);
  });
});
