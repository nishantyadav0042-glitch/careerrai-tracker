/**
 * ── BUG-FIX SPRINT, 23 SEP 2026: ISSUES #3–#6 FROM THE SALES REMARKS ───────
 *
 * #3 (wrong exam year) and the upload failure behind #6 were confirmed from
 * production data; #4 (crash) and #5 (second device) could not be reproduced
 * and are pinned here only where existing behaviour must not regress.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { impliedAttemptYear } from './cat-cycle';
import { catExamDate } from './exam-calendar';
import {
  MAX_FILES_PER_UPLOAD, PARSES_PER_HOUR, PARSES_PER_DAY, scannerQuotaExceeded,
} from './timetable-quota';
import { codeOnly } from './test-support/code-only';

const root = join(__dirname, '..', '..');
const code = (p: string) => codeOnly(readFileSync(join(root, p), 'utf8'));
const raw = (p: string) => readFileSync(join(root, p), 'utf8');

describe('#3 — the exam year a finish date implies', () => {
  it('CAT 2026 is Sunday 29 Nov 2026 (the boundary every case below uses)', () => {
    const d = catExamDate(2026);
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getDay()]).toEqual([2026, 11, 29, 0]);
  });

  it('a finish date after CAT 2026 means CAT 2027 (the reported student: 31 Dec 2026)', () => {
    expect(impliedAttemptYear('2026-12-31')).toBe(2027);
    expect(impliedAttemptYear('2026-11-30')).toBe(2027);
    expect(impliedAttemptYear('2027-03-05')).toBe(2027);
  });

  it('a 2026 student keeps 2026: any date up to and including exam day', () => {
    expect(impliedAttemptYear('2026-11-29')).toBe(2026);
    expect(impliedAttemptYear('2026-11-08')).toBe(2026);
    expect(impliedAttemptYear('2026-09-30')).toBe(2026);
  });

  it('refuses anything that is not a calendar date', () => {
    expect(impliedAttemptYear('31/12/2026')).toBeNull();
    expect(impliedAttemptYear('')).toBeNull();
  });

  it('saving a finish date fills the year ONLY when none is stored', () => {
    const route = code('src/app/api/student/post-signup/route.ts');
    expect(route).toMatch(/if \(cur && cur\.attempt_year == null\)/);
    expect(route).toMatch(/if \(implied != null && open\.includes\(implied\)\) update\.attempt_year = implied/);
    // An explicit year in the same request always wins over the inference.
    expect(route).toMatch(/update\.attempt_year === undefined/);
  });

  it('the backfill touches only NULL-year rows whose implied year differs from the fallback', () => {
    const sql = raw('supabase/migrations/20260923b_implied_attempt_year.sql')
      .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(sql).toMatch(/p\.attempt_year is null/);
    expect(sql).toMatch(/set attempt_year = i\.year/);
    // Only rows whose implied year differs from the calendar-year fallback.
    expect(sql).toMatch(/i\.year > extract\(year from current_date\)/);
    // Same exam-day rule as catExamDate: the last Sunday of November.
    expect(sql).toMatch(/make_date\(.*, 11, 30\)/);
    expect(sql).not.toMatch(/delete\b|drop\b/i);
  });
});

describe('#6 — the scanner quota admits what the upload screen offers', () => {
  it('one full upload and a full retry fit inside the hour', () => {
    // The bug: 6 an hour against an 8-photo upload.
    expect(PARSES_PER_HOUR).toBeGreaterThanOrEqual(2 * MAX_FILES_PER_UPLOAD);
    expect(scannerQuotaExceeded(MAX_FILES_PER_UPLOAD - 1, MAX_FILES_PER_UPLOAD - 1)).toBe(false);
    expect(scannerQuotaExceeded(2 * MAX_FILES_PER_UPLOAD - 1, 2 * MAX_FILES_PER_UPLOAD - 1)).toBe(false);
  });

  it('the production case now passes: 6 photos used, a 6-photo upload next', () => {
    for (let used = 6; used < 12; used++) expect(scannerQuotaExceeded(used, used)).toBe(false);
  });

  it('the cost guard still exists', () => {
    expect(scannerQuotaExceeded(PARSES_PER_HOUR, PARSES_PER_HOUR)).toBe(true);
    expect(scannerQuotaExceeded(0, PARSES_PER_DAY)).toBe(true);
  });

  it('the screen and the server read the same constant', () => {
    expect(code('src/components/timetable-upload.tsx')).toContain('.slice(0, MAX_FILES_PER_UPLOAD)');
    const route = code('src/app/api/timetable/parse/route.ts');
    expect(route).toContain('scannerQuotaExceeded(lastHour ?? 0, lastDay ?? 0)');
    expect(route).not.toMatch(/>= 6 \|\|/);
  });
});

describe('#5 — two devices on one account (not reproduced; must not regress)', () => {
  it('logging out ends only this device\'s session', () => {
    expect(code('src/app/api/auth/logout/route.ts')).toContain("signOut({ scope: 'local' })");
  });

  it('nothing in the student app signs other devices out', () => {
    for (const p of ['src/proxy.ts', 'src/app/student/layout.tsx', 'src/lib/push-client.ts']) {
      expect(code(p), p).not.toMatch(/scope: 'others'|scope: 'global'/);
    }
  });
});
