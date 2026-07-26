import { describe, it, expect } from 'vitest';
import { studyDayString, studyDayStart, STUDY_DAY_ROLLOVER_HOUR } from './study-day';

// The study day is the product's most-shared primitive: streaks, logs, plans,
// caps and once-a-day locks all key off it. It is NOT midnight and it is NOT
// UTC — a session running past midnight belongs to the previous study day
// until 3:00 AM IST, because 22:00–04:00 is the busiest study block we have.
//
// Every case here has cost us something. The 3am rule was hand-rolled as
// `new Date().toISOString().slice(0,10)` in several small client files, which
// is UTC midnight = 5:30 AM IST, so a student at 4 AM was in "yesterday" for
// their log and "today" for their insight cloud. These tests are what stops
// that from being reintroduced by a file that just wants a "today" key.

/** IST wall-clock → the absolute instant, without relying on the host TZ. */
const ist = (s: string) => new Date(`${s}+05:30`);

describe('studyDayString — the 3am IST boundary', () => {
  it('treats 02:30 IST as still yesterday', () => {
    expect(studyDayString(ist('2026-07-26T02:30:00'))).toBe('2026-07-25');
  });

  it('treats 03:30 IST as the new study day', () => {
    expect(studyDayString(ist('2026-07-26T03:30:00'))).toBe('2026-07-26');
  });

  it('treats late evening as the same day it feels like', () => {
    expect(studyDayString(ist('2026-07-26T23:00:00'))).toBe('2026-07-26');
  });

  it('rolls over exactly at 03:00:00, not a second earlier', () => {
    expect(studyDayString(ist('2026-07-26T02:59:59'))).toBe('2026-07-25');
    expect(studyDayString(ist('2026-07-26T03:00:00'))).toBe('2026-07-26');
  });

  it('is stable across the whole of a study day', () => {
    const day = ['03:00:00', '09:15:00', '18:45:00', '23:59:59']
      .map((t) => studyDayString(ist(`2026-07-26T${t}`)));
    expect(new Set(day).size).toBe(1);
    expect(day[0]).toBe('2026-07-26');
  });

  it('handles a month boundary', () => {
    expect(studyDayString(ist('2026-08-01T01:00:00'))).toBe('2026-07-31');
    expect(studyDayString(ist('2026-08-01T04:00:00'))).toBe('2026-08-01');
  });

  it('handles a year boundary', () => {
    expect(studyDayString(ist('2027-01-01T02:00:00'))).toBe('2026-12-31');
  });
});

describe('studyDayString — the regression it exists to prevent', () => {
  // Between 03:00 and 05:30 IST the study day has already rolled over but the
  // UTC calendar date has not. This 2.5-hour window is where the naive key and
  // the correct one disagree, and it sits inside our documented peak block.
  it('disagrees with a naive UTC date key between 3:00 and 5:30 IST', () => {
    const at4am = ist('2026-07-26T04:00:00');
    const naiveUtcKey = at4am.toISOString().slice(0, 10);

    expect(naiveUtcKey).toBe('2026-07-25');      // what the hand-rolled version said
    expect(studyDayString(at4am)).toBe('2026-07-26'); // what the student experienced
    expect(studyDayString(at4am)).not.toBe(naiveUtcKey);
  });

  it('agrees with the naive key outside that window, so the fix is narrow', () => {
    for (const t of ['06:00:00', '12:00:00', '20:00:00']) {
      const d = ist(`2026-07-26T${t}`);
      expect(studyDayString(d)).toBe(d.toISOString().slice(0, 10));
    }
  });
});

describe('studyDayStart', () => {
  it('returns 3:00 AM IST of the study day the instant belongs to', () => {
    const start = studyDayStart(ist('2026-07-26T23:00:00'));
    expect(start.toISOString()).toBe('2026-07-25T21:30:00.000Z'); // 03:00 IST on 26 Jul
  });

  it('is the exact instant at which the day key changes', () => {
    const start = studyDayStart(ist('2026-07-26T12:00:00'));
    expect(studyDayString(start)).toBe('2026-07-26');
    expect(studyDayString(new Date(start.getTime() - 1))).toBe('2026-07-25');
  });

  it('never returns a start in the future of the instant asked about', () => {
    for (const t of ['03:00:00', '03:00:01', '15:00:00', '23:59:59']) {
      const now = ist(`2026-07-26T${t}`);
      expect(studyDayStart(now).getTime()).toBeLessThanOrEqual(now.getTime());
    }
  });
});

describe('the rollover hour is a stated constant, not a magic number', () => {
  it('is 3, and studyDayStart uses it', () => {
    expect(STUDY_DAY_ROLLOVER_HOUR).toBe(3);
    const start = studyDayStart(ist('2026-07-26T12:00:00'));
    // 03:00 IST == 21:30 UTC the previous day
    expect(start.getUTCHours()).toBe(21);
    expect(start.getUTCMinutes()).toBe(30);
  });
});
