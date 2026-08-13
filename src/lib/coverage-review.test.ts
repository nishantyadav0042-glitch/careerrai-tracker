import { describe, it, expect } from 'vitest';
import { isReviewDue, daysSinceReview, REVIEW_INTERVAL_DAYS } from './coverage-review';

// ── The "weekly" checkpoint that ran daily ──────────────────────────────────
//
// Founder, 13 Aug: "this screen should come once a week not daily… it comes
// daily whenever I open the app."
//
// isReviewDue treated a missing stamp as due:
//
//     return days === null || days >= REVIEW_INTERVAL_DAYS;
//
// The stamp is only written when a student SUBMITS a review. So a student who
// had just finished onboarding — and therefore filled all 53 topics minutes
// earlier — was immediately asked "where are you right now?", and anyone who
// closed the sheet rather than completing it got it again on the next open,
// and the next. Measured when found: 241 of 296 onboarded students had never
// been stamped, so four in five were seeing a weekly checkpoint every session.
//
// The clock now starts where the data came from: onboarding is the first
// review. These tests pin the cadence at every boundary, because the failure
// was silent — no error, no crash, just a modal that never went away.

const DAY = 86_400_000;
const NOW = new Date('2026-08-13T12:00:00.000Z');
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

describe('the freshness clock starts at onboarding, not at nothing', () => {
  it('a student who JUST onboarded is not asked to review what they just filled', () => {
    expect(isReviewDue(null, true, NOW, ago(0))).toBe(false);
  });

  it('stays quiet for the whole first interval', () => {
    for (const d of [1, 2, 3, 5, 6]) {
      expect(isReviewDue(null, true, NOW, ago(d)), `day ${d} should be quiet`).toBe(false);
    }
  });

  it('fires once the interval has actually passed', () => {
    expect(isReviewDue(null, true, NOW, ago(REVIEW_INTERVAL_DAYS))).toBe(true);
    expect(isReviewDue(null, true, NOW, ago(30))).toBe(true);
  });

  it('an unknown age is never treated as stale', () => {
    // The old behaviour: no stamp meant "due", which is what produced the nag.
    // No anchor at all is an absence of evidence, not evidence of staleness.
    expect(isReviewDue(null, true, NOW, null)).toBe(false);
    expect(isReviewDue(null, true, NOW, undefined)).toBe(false);
  });
});

describe('a real review stamp always wins over the onboarding anchor', () => {
  it('a fresh stamp silences it even when onboarding was long ago', () => {
    expect(isReviewDue(ago(1), true, NOW, ago(90))).toBe(false);
  });

  it('an old stamp fires it even when onboarding was recent', () => {
    expect(isReviewDue(ago(20), true, NOW, ago(1))).toBe(true);
  });

  it('the interval restarts from the stamp, not the anchor', () => {
    expect(isReviewDue(ago(REVIEW_INTERVAL_DAYS - 1), true, NOW, ago(365))).toBe(false);
    expect(isReviewDue(ago(REVIEW_INTERVAL_DAYS), true, NOW, ago(365))).toBe(true);
  });
});

describe('onboarding still outranks everything', () => {
  it('never interrupts a student who has not finished onboarding', () => {
    expect(isReviewDue(null, false, NOW, ago(365))).toBe(false);
    expect(isReviewDue(ago(365), false, NOW, ago(365))).toBe(false);
  });
});

describe('daysSinceReview', () => {
  it('counts whole days', () => {
    expect(daysSinceReview(ago(0), NOW)).toBe(0);
    expect(daysSinceReview(ago(7), NOW)).toBe(7);
  });

  it('returns null for missing or unparseable input rather than guessing', () => {
    expect(daysSinceReview(null, NOW)).toBeNull();
    expect(daysSinceReview(undefined, NOW)).toBeNull();
    expect(daysSinceReview('not-a-date', NOW)).toBeNull();
  });
});

describe('the two callers must agree', () => {
  it('the layout gate passes an anchor', () => {
    // If the layout passed one and the API did not (or vice versa), the sheet
    // would render and then immediately close itself on its own fetch.
    const layout = readFile('src/app/student/layout.tsx');
    expect(layout).toContain('onboarding_last_activity_at');
  });

  it('the API route passes the same anchor', () => {
    const route = readFile('src/app/api/coverage/weekly-review/route.ts');
    expect(route).toContain('onboarding_last_activity_at');
    expect(route).toContain('filledAt');
  });
});

function readFile(p: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('node:fs').readFileSync(p, 'utf8');
}
