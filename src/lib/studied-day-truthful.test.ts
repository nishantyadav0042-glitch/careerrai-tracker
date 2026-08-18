import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { dayWasStudied } from './check-in';

// ── A3 — "did the student study?" is answered by the student, not by the ─────
//    hours column that was never allowed to ask.
//
// The defect (G4 §3, adjacent issue A3): the check-in gate writes
// `hours: 0` deliberately — its own comment says "A check-in is not a study
// claim" — into a column that is NOT NULL DEFAULT 0 and therefore cannot say
// "not collected". Meanwhile the student HAS answered the question, in
// `day_outcome`.
//
// Result in production: 62 real rows across 38 students carry
// `day_outcome ∈ {studied, partial}` while `study_duration = 0`, and four
// consumers ask `study_duration > 0` to decide whether the day was a study
// day. All four answer "no" about a student who said "yes".
//
// The sharpest surface is the student's own log payoff line
// (`log-daily`'s studyDaysIn7): "N/7 study days last week. CAT rewards
// consistency more than intensity." A student who checked in "Studied" five
// days is told 0/7 and lectured about consistency.
//
// SCOPE (founder ruling, J6-A): narrow. This changes nothing about what
// `study_duration` means or stores. It stops four consumers answering a
// question from a column that cannot know it, when a column that does know it
// is already on the row. No schema, no migration, no backfill, no value
// rewritten — J6-A forbids all four.

const code = (p: string) =>
  readFileSync(join(process.cwd(), p), 'utf8')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n');

describe('dayWasStudied — one authority for "was this a study day"', () => {
  it('the student saying so is enough, even with zero hours (the A3 case)', () => {
    expect(dayWasStudied({ day_outcome: 'studied', study_duration: 0 })).toBe(true);
    expect(dayWasStudied({ day_outcome: 'partial', study_duration: 0 })).toBe(true);
  });

  it('"studied a bit" counts — they sat down, which is the question being asked', () => {
    // OUTCOME_OPTIONS: partial = "Studied a bit / Sat down, didn't finish".
    expect(dayWasStudied({ day_outcome: 'partial', study_duration: 0 })).toBe(true);
  });

  it('credited hours alone are enough when no outcome was ever declared', () => {
    expect(dayWasStudied({ day_outcome: null, study_duration: 2.5 })).toBe(true);
    expect(dayWasStudied({ day_outcome: undefined, study_duration: 0.3 })).toBe(true);
  });

  it('an honest "didn\'t study" or rest day is NOT a study day', () => {
    expect(dayWasStudied({ day_outcome: 'not_studied', study_duration: 0 })).toBe(false);
    expect(dayWasStudied({ day_outcome: 'skipped', study_duration: 0 })).toBe(false);
  });

  it('no signal either way is not a study day — absence is not evidence', () => {
    expect(dayWasStudied({ day_outcome: null, study_duration: 0 })).toBe(false);
  });

  it('is MONOTONE — it can never take away a day that already counted', () => {
    // Production check: ZERO real rows carry not_studied/skipped WITH hours,
    // so this branch is not reachable from today's data. It is pinned anyway:
    // if such a row is ever written, hours already counted it and this rule
    // must not silently remove a study day from a student's history.
    expect(dayWasStudied({ day_outcome: 'not_studied', study_duration: 4 })).toBe(true);
    expect(dayWasStudied({ day_outcome: 'skipped', study_duration: 1 })).toBe(true);
  });

  it('tolerates the string/unknown shapes Supabase actually returns', () => {
    expect(dayWasStudied({ day_outcome: 'studied', study_duration: null })).toBe(true);
    expect(dayWasStudied({ day_outcome: null, study_duration: '2.5' as unknown as number })).toBe(true);
    expect(dayWasStudied({ day_outcome: 'nonsense', study_duration: 0 })).toBe(false);
    expect(dayWasStudied({})).toBe(false);
  });
});

describe('all four "did they study" consumers use the authority, not the raw column', () => {
  const SITES: [string, string][] = [
    ['src/app/api/logging/log-daily/route.ts', 'studyDaysIn7 — the student-facing payoff line'],
    ['src/app/api/routine/today/route.ts', 'activeDays21 / recentActive10'],
    ['src/lib/student-360.ts', 'admin 360 direction'],
    ['src/lib/lis-health.ts', 'cohort direction'],
  ];

  for (const [path, what] of SITES) {
    it(`${path} (${what}) no longer tests study_duration > 0 directly`, () => {
      const src = code(path);
      expect(src, 'the raw > 0 / <= 0 study-duration test must be gone')
        .not.toMatch(/\(Number\(r\.study_duration\)\s*\|\|\s*0\)\s*<=\s*0/);
      expect(src).not.toMatch(/r\.study_duration as number\)\s*>\s*0/);
      expect(src, 'it must call the shared authority instead').toContain('dayWasStudied');
    });
  }

  it('the three consumers that did not already select day_outcome now do', () => {
    // today/route.ts already selected it; the other three did not. Adding a
    // column to an existing select is not a new query.
    for (const p of ['src/app/api/logging/log-daily/route.ts', 'src/lib/student-360.ts', 'src/lib/lis-health.ts']) {
      expect(code(p), `${p} must read the column that actually knows`).toContain('day_outcome');
    }
  });
});

describe('scope containment — J6-A forbids everything below', () => {
  it('no historical value is rewritten: study_duration write semantics untouched', () => {
    expect(code('src/app/api/routine/complete-task/route.ts'))
      .toContain('const mergedHours = Math.max(earned, existingLog?.study_duration ?? 0);');
    expect(code('src/app/api/logging/log-daily/route.ts')).toMatch(/p_study_duration:\s*body\.hours,/);
  });

  it('no new migration — no schema change, no backfill', () => {
    expect(execSync('git status --porcelain supabase/migrations', { cwd: process.cwd() }).toString()).toBe('');
  });

  it('the four DEFERRED consumers (G4 §6) are not repointed', () => {
    // Founder ruling: deferred until the semantic model is locked. Each of
    // these reads study_duration for a MAGNITUDE, not for "did they study",
    // so A3 does not touch them.
    expect(code('src/lib/student-360.ts')).toContain('computeCapacity(hrs,');
    expect(code('src/lib/lis-health.ts')).toContain('computeCapacity(hrs,');
    expect(code('src/app/api/cron/weekly-plan-reconcile/route.ts')).toContain('study_duration');
    expect(code('src/lib/prep-gain.ts')).toContain('study_duration');
    expect(code('src/lib/buddy-case-data.ts')).toContain('study_duration');
  });

  it('no credited/self-reported column is introduced — that is G5, not A3', () => {
    for (const p of ['src/lib/check-in.ts', 'src/app/api/logging/log-daily/route.ts', 'src/lib/student-360.ts']) {
      expect(code(p)).not.toContain('credited_study_duration');
      expect(code(p)).not.toContain('self_reported_study_duration');
    }
  });
});
