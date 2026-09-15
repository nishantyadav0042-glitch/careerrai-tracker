import { describe, it, expect } from 'vitest';
import {
  studyHeadline, studyCaveat, readStudyTruth,
  MATURE_AFTER_DAYS, HABIT_MIN_DAYS, HABIT_WINDOW_DAYS, type StudyTruth,
} from './study-truth';

const week = (studied: number, matureStudied: number, logRows: number, zeroHourRows: number) =>
  ({ studied, matureStudied, logRows, zeroHourRows });

const truth = (over: Partial<StudyTruth> = {}): StudyTruth => ({
  thisWeek: week(40, 25, 150, 65),
  lastWeek: week(35, 20, 140, 60),
  habit: { cohortWeek: '2026-08-24', signups: 218, ratePct: 6 },
  ...over,
});

describe('the headline counts people, never rows', () => {
  // The whole defect: 170 log rows in the best week, 91 of them recording NO
  // study. "Logs went up" was quoted as studying for a month.
  it('leads with students who actually studied', () => {
    const s = studyHeadline(truth());
    expect(s).toMatch(/^40 students actually studied/);
    expect(s).not.toMatch(/^\d+ logs/);
  });

  it('says which direction it moved', () => {
    expect(studyHeadline(truth())).toContain('up from 35');
    expect(studyHeadline(truth({ thisWeek: week(20, 10, 100, 50) }))).toContain('down from 35');
    expect(studyHeadline(truth({ thisWeek: week(35, 20, 100, 50) }))).toContain('level with 35');
  });

  // An arrival spike moves the raw count without anybody forming a habit —
  // 117 of the 140 logs in the week of 17 Aug were students under 8 days old.
  it('separates the students an ad spike cannot explain', () => {
    expect(studyHeadline(truth())).toContain('25 of them past their first week');
  });
});

describe('the caveat travels with the number', () => {
  it('states what share of rows recorded no study', () => {
    // 65 of 150 = 43%.
    expect(studyCaveat(truth())).toContain('43% of them recorded no study time');
    expect(studyCaveat(truth())).toContain('Count students who studied, not logs');
  });

  it('says nothing when there is nothing to caveat', () => {
    expect(studyCaveat(truth({ thisWeek: week(0, 0, 0, 0) }))).toBeNull();
  });
});

// ── THE TRAP THAT INVENTS A TREND ───────────────────────────────────────────
//
// A cohort mid-window always looks worse than a finished one. Quoting the
// newest cohort beside complete ones is the easiest way to manufacture a rise
// — and the newest is always the one someone wants to quote.
describe('an unfinished cohort is not reported at all', () => {
  it('omits the habit line rather than printing a partial one', () => {
    const s = studyHeadline(truth({ habit: null }));
    expect(s).not.toContain('Habit rate');
    expect(s).toMatch(/^40 students actually studied/);
  });

  it('names the cohort whose window closed, so it can be checked', () => {
    expect(studyHeadline(truth())).toContain('last complete cohort (2026-08-24): 6%');
  });

  it('keeps the window and the bar explicit', () => {
    expect(HABIT_WINDOW_DAYS).toBe(21);
    expect(HABIT_MIN_DAYS).toBe(3);
    expect(MATURE_AFTER_DAYS).toBe(7);
  });
});

// ── THE QUERY SIDE ──────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
function admin(tables: Record<string, any>) {
  const chain = (table: string): any => {
    const c: any = {};
    for (const m of ['select', 'eq', 'in', 'gte', 'lt', 'not', 'order', 'limit', 'range']) c[m] = () => c;
    c.then = (ok: any) => {
      const v = tables[table];
      if (v instanceof Error) return Promise.resolve({ data: null, error: { message: v.message } }).then(ok);
      return Promise.resolve({ data: v ?? [], error: null }).then(ok);
    };
    return c;
  };
  return { from: chain };
}

const NOW = Date.parse('2026-09-15T12:00:00Z');
const dayAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString().slice(0, 10);

describe('reading it off the database', () => {
  const profiles = [
    { id: 'old1', created_at: new Date(NOW - 40 * 86_400_000).toISOString() },
    { id: 'old2', created_at: new Date(NOW - 30 * 86_400_000).toISOString() },
    { id: 'new1', created_at: new Date(NOW - 2 * 86_400_000).toISOString() },
  ];

  it('counts a zero-hour row as not studying', async () => {
    const t = await readStudyTruth(admin({
      daily_reports: [
        { student_id: 'old1', report_date: dayAgo(1), study_duration: 2 },
        { student_id: 'old2', report_date: dayAgo(2), study_duration: 0 },
        { student_id: 'new1', report_date: dayAgo(3), study_duration: null },
      ],
      profiles,
    }), NOW);
    expect(t.thisWeek.studied).toBe(1);
    expect(t.thisWeek.logRows).toBe(3);
    expect(t.thisWeek.zeroHourRows).toBe(2);
  });

  it('does not let a student who studied twice count twice', async () => {
    const t = await readStudyTruth(admin({
      daily_reports: [
        { student_id: 'old1', report_date: dayAgo(1), study_duration: 2 },
        { student_id: 'old1', report_date: dayAgo(2), study_duration: 3 },
      ],
      profiles,
    }), NOW);
    expect(t.thisWeek.studied).toBe(1);
  });

  it('excludes a first-week student from the mature count', async () => {
    const t = await readStudyTruth(admin({
      daily_reports: [
        { student_id: 'new1', report_date: dayAgo(1), study_duration: 2 },
        { student_id: 'old1', report_date: dayAgo(1), study_duration: 2 },
      ],
      profiles,
    }), NOW);
    expect(t.thisWeek.studied).toBe(2);
    expect(t.thisWeek.matureStudied).toBe(1);
  });

  it('splits this week from last', async () => {
    const t = await readStudyTruth(admin({
      daily_reports: [
        { student_id: 'old1', report_date: dayAgo(2), study_duration: 2 },
        { student_id: 'old2', report_date: dayAgo(10), study_duration: 2 },
      ],
      profiles,
    }), NOW);
    expect(t.thisWeek.studied).toBe(1);
    expect(t.lastWeek.studied).toBe(1);
  });

  // A digest that fails to send teaches the founder to ignore the digest.
  it('returns zeros rather than throwing when the read fails', async () => {
    const t = await readStudyTruth(admin({ daily_reports: new Error('down') }), NOW);
    expect(t.thisWeek).toEqual({ studied: 0, matureStudied: 0, logRows: 0, zeroHourRows: 0 });
    expect(t.habit).toBeNull();
  });
});
