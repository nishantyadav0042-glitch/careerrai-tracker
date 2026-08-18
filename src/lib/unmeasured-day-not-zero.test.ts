import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { reconcileWeek } from './plan-extension';

// ── Q5 — an unmeasured day must not move the finish date ────────────────────
//
// Founder ruling, 18 Aug: "Not measured" != "0 hours". Do not invent hours, do
// not count them as zero, do not push the student's finish date for a day we
// never measured, and give them one obvious action: complete the full log.
//
// The path (docs/0C-3G-Q5-FINISH-DATE-AUDIT.md): a "Studied" check-in writes
// study_duration = 0 because the gate has no duration field; weekly-plan-
// reconcile reads that 0 at face value; reconcileWeek turns it into a deficit;
// syllabus_target_date moves. 58 days across 35 students.
//
// THE MECHANISM ALREADY EXISTS. `joinedOn` removes a day from BOTH `expected`
// and `actual`, and its own comment gives the reason: "a warning that blames
// someone for time before they arrived is not a coach, it is a bug wearing a
// coach's voice." That is the same argument for a day whose hours we never
// asked about. This gate applies the existing concept to a second case rather
// than inventing a parallel one.
//
// NULL means UNKNOWN. 0 still means a real zero. The type has always been
// `(number | null)[]`; only the contract collapsed the two.
//
// WHAT THIS DOES NOT CHANGE: the 6 Aug ruling that a student who never opens
// the app still sees their date move. No row at all is still 0.

const WEEK = ['2026-08-10','2026-08-11','2026-08-12','2026-08-13','2026-08-14','2026-08-15','2026-08-16'];
const base = {
  weekdayHours: 4,
  weekendHours: 4,
  isWeekendByDay: [false, false, false, false, false, true, true],
  currentTargetDate: '2026-10-01',
  examDate: '2026-11-29',
  daysInWeek: WEEK,
};

describe('an unmeasured day is not judged', () => {
  it('a week of unmeasured days does not move the finish date', () => {
    // The student checked in "Studied" every day and never completed the log.
    const r = reconcileWeek({ ...base, loggedHoursByDay: [null, null, null, null, null, null, null] });
    expect(r.daysAdded, 'nothing was measured, so nothing can be owed').toBe(0);
    expect(r.newDate).toBe(base.currentTargetDate);
    expect(r.deficitHours).toBe(0);
    expect(r.warning, 'no warning about hours we never asked for').toBeNull();
  });

  it('excludes the unmeasured day from EXPECTED as well as ACTUAL', () => {
    // Excluding from `actual` alone would GROW the deficit and make the harm
    // worse — the single most likely way to implement this wrongly.
    const r = reconcileWeek({ ...base, loggedHoursByDay: [4, 4, 4, 4, null, null, null] });
    expect(r.expectedHours, 'four counted days at 4h').toBe(16);
    expect(r.actualHours).toBe(16);
    expect(r.daysAdded).toBe(0);
  });

  it('a REAL zero still counts against the student', () => {
    // 'not_studied' / 'skipped' are complete answers (Q2). They are 0, not null.
    const r = reconcileWeek({ ...base, loggedHoursByDay: [0, 0, 0, 0, 0, 0, 0] });
    expect(r.expectedHours).toBe(28);
    expect(r.actualHours).toBe(0);
    expect(r.daysAdded).toBeGreaterThan(0);
  });

  it('the 6 Aug ruling survives: a student who never opens the app still moves', () => {
    // The caller passes 0 for a day with NO ROW. Only a row that told us
    // something we failed to finish asking about becomes null.
    const r = reconcileWeek({ ...base, loggedHoursByDay: [0, 0, 0, 0, 0, 0, 0] });
    expect(r.warning).toContain('short');
  });

  it('mixes measured, real-zero and unmeasured days correctly', () => {
    // Mon 4h measured · Tue real zero · Wed unmeasured · Thu-Sun measured 4h.
    const r = reconcileWeek({ ...base, loggedHoursByDay: [4, 0, null, 4, 4, 4, 4] });
    expect(r.expectedHours, 'six judged days — Wednesday is not judged').toBe(24);
    expect(r.actualHours).toBe(20);
    expect(r.deficitHours).toBe(4);
  });

  it('an unmeasured day is treated exactly like a pre-join day', () => {
    // Same shape, two reasons: both are days we have no standing to judge.
    const unmeasured = reconcileWeek({ ...base, loggedHoursByDay: [null, null, 4, 4, 4, 4, 4] });
    const preJoin = reconcileWeek({
      ...base, joinedOn: WEEK[2], loggedHoursByDay: [0, 0, 4, 4, 4, 4, 4],
    });
    expect(unmeasured.expectedHours).toBe(preJoin.expectedHours);
    expect(unmeasured.actualHours).toBe(preJoin.actualHours);
    expect(unmeasured.daysAdded).toBe(preJoin.daysAdded);
  });

  it('never invents hours — an unmeasured week reports 0 actual, not an estimate', () => {
    const r = reconcileWeek({ ...base, loggedHoursByDay: [null, null, null, null, null, null, null] });
    expect(r.actualHours).toBe(0);
    expect(r.expectedHours, 'and expects nothing, which is why the deficit is 0').toBe(0);
  });
});

describe('the reconcile route decides null vs zero from the pair, not the source alone', () => {
  const route = readFileSync(join(process.cwd(), 'src/app/api/cron/weekly-plan-reconcile/route.ts'), 'utf8')
    .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

  it('reads the two columns the decision needs', () => {
    expect(route).toContain('day_outcome');
    expect(route).toContain('study_duration_source');
  });

  it('uses the shared authority rather than re-spelling the rule', () => {
    expect(route, 'G6: source alone overstates by 29% — the pair decides')
      .toContain('durationIsUnknown');
  });

  it('a day with NO ROW is still zero, not unknown', () => {
    // The 6 Aug ruling: silence still moves the date. This must be pinned on
    // the ACTUAL mapping, not on any `?? 0` anywhere in the file — the map now
    // holds `number | null`, so a plain `?? 0` would convert a stored unknown
    // back into a zero and quietly undo this whole gate.
    expect(route).toMatch(/hoursByStudentDay\.has\(key\)[\s\S]{0,80}:\s*0/);
  });
});

describe('scope containment', () => {
  it('no new migration', () => {
    expect(execSync('git status --porcelain supabase/migrations', { cwd: process.cwd() }).toString()).toBe('');
  });

  it('the extension arithmetic itself is untouched', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/plan-extension.ts'), 'utf8');
    expect(src).toContain('const clearRate = weekday > 0 ? weekday : 1;');
    expect(src).toContain('Math.ceil(deficit / clearRate)');
  });
});
