import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { codeOnly } from '@/lib/test-support/code-only';
import {
  REFUND_REQUIRED_DAYS, REFUND_WINDOW_DAYS,
  refundWindow, isInRefundWindow, refundShortfallMessage,
} from './refund-policy';

// ── A GUARANTEE NOBODY COULD CLAIM ──────────────────────────────────────────
//
// The refund bar was 20 logged study days in the first 30. Measured 16 Sep
// 2026, every student who has ever paid CareerRai, in first-30-day logged
// days: 15, 11, 10, 7, 5, 4, 4. Nobody reached 20 — the promise printed on
// /pricing, /terms and /refunds had never once been claimable.
//
// It survived because the number lived as five separate literals across five
// files. Nothing connected the sentence a student read to the comparison the
// server ran, so nothing could notice they had come apart — or that the bar
// had been set above what any customer could reach.
//
// These tests hold the two halves together. Two things fail the build here:
// re-typing the number on any surface instead of importing it, and raising the
// bar past what our most engaged paying student has ever actually done.

const FILES = {
  route: 'src/app/api/student/request-refund/route.ts',
  profile: 'src/app/student/profile/page.tsx',
  refunds: 'src/app/refunds/page.tsx',
  terms: 'src/app/terms/page.tsx',
  pricing: 'src/app/pricing/page.tsx',
  card: 'src/app/student/profile/refund-card.tsx',
} as const;

const src = (k: keyof typeof FILES) => codeOnly(readFileSync(join(process.cwd(), FILES[k]), 'utf8'));

/**
 * Logged days in the first 30 by the most engaged student who has ever paid
 * us. Measured 16 Sep 2026 across all seven payers: 15, 11, 10, 7, 5, 4, 4.
 *
 * This is the ceiling on the bar, and it is the whole point of the fix. A
 * refund condition set above this is not a condition — it is a refusal written
 * in advance, and we would be advertising it on three public pages.
 */
const BEST_PAYING_STUDENT_DAYS = 15;

describe('the bar is one a real customer can actually reach', () => {
  it('never exceeds what our most engaged payer has ever logged', () => {
    expect(REFUND_REQUIRED_DAYS,
      `${REFUND_REQUIRED_DAYS} days is above the ${BEST_PAYING_STUDENT_DAYS} our best-ever paying student logged. `
      + 'Raising it there makes the guarantee unclaimable again — the exact fault this module was created to end.')
      .toBeLessThanOrEqual(BEST_PAYING_STUDENT_DAYS);
  });

  it('still asks for a genuine trial, not a single visit', () => {
    // Below a handful of days the condition stops meaning anything: a student
    // who logged twice has not given the mentor or the plan a real chance.
    expect(REFUND_REQUIRED_DAYS).toBeGreaterThanOrEqual(5);
  });

  it('fits inside the window it is measured over', () => {
    expect(REFUND_REQUIRED_DAYS).toBeLessThan(REFUND_WINDOW_DAYS);
  });
});

describe('one number, read by every surface that states or enforces it', () => {
  for (const key of ['route', 'profile', 'refunds', 'terms', 'pricing'] as const) {
    it(`${FILES[key]} imports the bar instead of typing it`, () => {
      expect(src(key), `${FILES[key]} states or enforces the refund bar and must read it from @/lib/refund-policy`)
        .toMatch(/from\s+['"]@\/lib\/refund-policy['"]/);
    });

    it(`${FILES[key]} contains no hardcoded day count`, () => {
      const code = src(key);
      // A bare digit next to the promise is how the copy and the code drifted
      // apart in the first place. Every one of these must be an interpolation.
      expect(code, 'found a literal number of study days — interpolate REFUND_REQUIRED_DAYS')
        .not.toMatch(/\d+\s*study\s+days/i);
      expect(code, 'found a literal "at least N" — interpolate REFUND_REQUIRED_DAYS')
        .not.toMatch(/at least\s+\d/i);
      expect(code, 'found a literal "fewer than N" — interpolate REFUND_REQUIRED_DAYS')
        .not.toMatch(/fewer than\s+\d/i);
    });
  }

  it('the student-facing card takes the bar as a prop, never its own copy', () => {
    const code = src('card');
    expect(code).toMatch(/required/);
    expect(code).not.toMatch(/at least\s+\d/i);
    expect(code).not.toMatch(/=\s*20\b/);
  });
});

describe('the granting route and the progress bar count the same days', () => {
  // These two were written independently and ran two different queries against
  // the same promise. Whichever was more generous, a student could be shown a
  // green "Eligible" badge and then be refused by the server.
  it('both count through refundWindow()', () => {
    expect(src('route'), 'the granting route must use the shared window').toMatch(/refundWindow\s*\(/);
    expect(src('profile'), 'the profile progress bar must use the shared window').toMatch(/refundWindow\s*\(/);
  });

  it('both bound the count at BOTH ends of the window', () => {
    // The original pair applied only the upper bound, so any log recorded
    // before signup counted toward the guarantee.
    for (const key of ['route', 'profile'] as const) {
      const code = src(key);
      expect(code, `${FILES[key]} must apply the window's start`).toMatch(/\.gte\(\s*['"]report_date['"]/);
      expect(code, `${FILES[key]} must apply the window's end`).toMatch(/\.lte\(\s*['"]report_date['"]/);
    }
  });
});

describe('refundWindow', () => {
  it('starts on the day the account was created', () => {
    expect(refundWindow('2026-08-03T11:20:00.000Z').start).toBe('2026-08-03');
  });

  it('ends REFUND_WINDOW_DAYS later', () => {
    expect(refundWindow('2026-08-03T11:20:00.000Z').end).toBe('2026-09-02');
  });

  it('crosses a month boundary without arithmetic drift', () => {
    expect(refundWindow('2026-01-31T00:00:00.000Z').end).toBe('2026-03-02');
  });
});

describe('isInRefundWindow', () => {
  const joined = '2026-08-03T00:00:00.000Z';
  it('is open on the last day', () => {
    expect(isInRefundWindow(joined, new Date('2026-09-02T00:00:00.000Z'))).toBe(true);
  });
  it('is shut the day after', () => {
    expect(isInRefundWindow(joined, new Date('2026-09-04T00:00:00.000Z'))).toBe(false);
  });
});

describe('refundShortfallMessage', () => {
  it('names the bar, their count and the gap', () => {
    const m = refundShortfallMessage(4);
    expect(m).toContain(`${REFUND_REQUIRED_DAYS} logged study days`);
    expect(m).toContain('You have 4');
    expect(m).toContain(`${REFUND_REQUIRED_DAYS - 4} more to go`);
  });

  it('never promises a negative gap', () => {
    expect(refundShortfallMessage(REFUND_REQUIRED_DAYS + 3)).toContain('0 more to go');
  });
});
