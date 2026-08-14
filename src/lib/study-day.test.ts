import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { studyDayString, studyDayStart, STUDY_DAY_ROLLOVER_MINUTES } from './study-day';

// The study day is the product's most-shared primitive: streaks, logs, plans,
// caps and once-a-day locks all key off it.
//
// It rolls at 05:30 IST (founder, 14 Aug: "keep it Indian 5:30 am to 5:30"),
// which means a student still working at 3 AM is finishing YESTERDAY — the
// day they think they are on.
//
// It was 03:00 until 14 Aug, and the move is what closed the date-integrity
// gate. 05:30 IST is exactly 00:00 UTC, so this function and the plain
// `toISOString().slice(0,10)` that dozens of files already use now return the
// same string, always. The old 2.5-hour disagreement every morning is not
// narrowed, it is gone — and two files were using the wrong side of it to
// DELETE a student's plan row.

/** IST wall-clock → the absolute instant, without relying on the host TZ. */
const ist = (s: string) => new Date(`${s}+05:30`);

describe('studyDayString — the 5:30 AM IST boundary', () => {
  it('treats a 3 AM session as still yesterday', () => {
    expect(studyDayString(ist('2026-07-26T03:00:00'))).toBe('2026-07-25');
  });

  it('rolls over exactly at 05:30:00, not a second earlier', () => {
    expect(studyDayString(ist('2026-07-26T05:29:59'))).toBe('2026-07-25');
    expect(studyDayString(ist('2026-07-26T05:30:00'))).toBe('2026-07-26');
  });

  it('covers the boundary minute by minute', () => {
    const cases: [string, string][] = [
      ['02:59:00', '2026-07-25'],
      ['03:00:00', '2026-07-25'],
      ['03:01:00', '2026-07-25'],
      ['05:00:00', '2026-07-25'],
      ['05:30:01', '2026-07-26'],
      ['06:00:00', '2026-07-26'],
    ];
    for (const [t, expected] of cases) {
      expect(studyDayString(ist(`2026-07-26T${t}`)), t).toBe(expected);
    }
  });

  it('treats late evening as the day it feels like', () => {
    expect(studyDayString(ist('2026-07-26T23:00:00'))).toBe('2026-07-26');
  });

  it('is stable across the whole of a study day', () => {
    const day = ['05:30:00', '09:15:00', '18:45:00', '23:59:59', '02:00:00']
      .map((t, i) => studyDayString(ist(`2026-07-${i === 4 ? '27' : '26'}T${t}`)));
    expect(new Set(day).size).toBe(1);
    expect(day[0]).toBe('2026-07-26');
  });

  it('handles a month boundary', () => {
    expect(studyDayString(ist('2026-08-01T04:00:00'))).toBe('2026-07-31');
    expect(studyDayString(ist('2026-08-01T06:00:00'))).toBe('2026-08-01');
  });

  it('handles a year boundary', () => {
    expect(studyDayString(ist('2027-01-01T02:00:00'))).toBe('2026-12-31');
  });
});

describe('ONE definition of today — the whole point of the 5:30 move', () => {
  // This is the invariant that makes the date gate enforceable. Dozens of
  // files derive a date with toISOString().slice(0,10). Rather than hunt every
  // one of them forever, the study day is DEFINED so that they cannot be
  // wrong: 05:30 IST is 00:00 UTC.
  it('agrees with a plain UTC date key at every hour of the day', () => {
    for (let h = 0; h < 24; h++) {
      for (const m of [0, 29, 30, 31, 59]) {
        const d = ist(`2026-07-26T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
        expect(studyDayString(d), `${h}:${m} IST`).toBe(d.toISOString().slice(0, 10));
      }
    }
  });

  it('agrees across a month and a year boundary too', () => {
    for (const iso of ['2026-07-31T23:59:59', '2026-08-01T00:00:00', '2026-12-31T22:00:00', '2027-01-01T04:00:00']) {
      const d = ist(iso);
      expect(studyDayString(d), iso).toBe(d.toISOString().slice(0, 10));
    }
  });

  it('holds for 2000 random instants across a year', () => {
    const base = Date.parse('2026-01-01T00:00:00Z');
    let seed = 99;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 2000; i++) {
      const d = new Date(base + Math.floor(rnd() * 365 * 86_400_000));
      expect(studyDayString(d)).toBe(d.toISOString().slice(0, 10));
    }
  });
});

describe('studyDayStart', () => {
  it('returns 05:30 IST of the study day the instant belongs to', () => {
    const start = studyDayStart(ist('2026-07-26T23:00:00'));
    expect(start.toISOString()).toBe('2026-07-26T00:00:00.000Z'); // 05:30 IST on 26 Jul
  });

  it('is the exact instant at which the day key changes', () => {
    const start = studyDayStart(ist('2026-07-26T12:00:00'));
    expect(studyDayString(start)).toBe('2026-07-26');
    expect(studyDayString(new Date(start.getTime() - 1))).toBe('2026-07-25');
  });

  it('never returns a start in the future of the instant asked about', () => {
    for (const t of ['05:30:00', '05:30:01', '15:00:00', '23:59:59']) {
      const now = ist(`2026-07-26T${t}`);
      expect(studyDayStart(now).getTime()).toBeLessThanOrEqual(now.getTime());
    }
  });
});

describe('the rollover is a stated constant, not a magic number', () => {
  it('is 05:30 IST, and studyDayStart uses it', () => {
    expect(STUDY_DAY_ROLLOVER_MINUTES).toBe(330);
    const start = studyDayStart(ist('2026-07-26T12:00:00'));
    expect(start.getUTCHours()).toBe(0);
    expect(start.getUTCMinutes()).toBe(0);
  });

  it('is documented as the founder set it', () => {
    // A future reader must not "fix" this back to 3 AM.
    expect(readFileSync('src/lib/study-day.ts', 'utf8')).toContain('THE ROLLOVER IS 5:30 AM IST');
  });
});
