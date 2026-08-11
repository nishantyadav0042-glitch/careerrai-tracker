import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// ── The mentor check-in is PAID. ────────────────────────────────────────────
//
// Founder, 10 Aug 2026: "this feature is only for premium students, who has
// subscribed to CareerRai. This is only our premium feature, don't build this
// for free."
//
// It sits on the paid side of the line this codebase already draws: the machine
// is free, the human is paid (see timetable-free.guard.test.ts). A study plan
// is automation and costs us cents. A mentor personally noticing you went quiet
// and messaging you from their own account is a person's attention — it is the
// thing the subscription actually buys, and it is the reason "one mentor, max
// 5 students" is affordable at all.
//
// Two gates, and the test insists on BOTH, because they fail differently:
//   · the cron gate stops drafts ever being written for a free student;
//   · the send gate stops a draft written while they were paying from being
//     sent after they lapsed — a draft is sendable for 36h and
//     expire-subscriptions runs daily, so that window is real, not theoretical.
//
// This is a guard rather than a comment because a paywall is exactly the kind
// of thing that gets dropped by accident in a refactor — and unlike most
// regressions, giving a paid feature away is silent. Nobody files a bug when
// they get something for free.

const cron = readFileSync('src/app/api/cron/buddy-checkin/route.ts', 'utf8');
const sendRoute = readFileSync('src/app/api/buddy/checkin/route.ts', 'utf8');

/** Strip comments so prose ABOUT the gate doesn't read as the gate. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join('\n');
}

describe('the buddy check-in never reaches a free student', () => {
  it('the cron drafts only for paying students', () => {
    const src = code(cron);
    expect(src).toMatch(/\.eq\(\s*['"]is_premium['"]\s*,\s*true\s*\)/);
  });

  it('having a buddy is not accepted as proof of paying', () => {
    // Measured 10 Aug: one assigned student had is_premium = false, so the
    // buddy_id filter alone would have leaked the feature. If someone ever
    // decides buddy_id implies premium, this is where they find out it doesn't.
    const src = code(cron);
    expect(src).toMatch(/buddy_id/);
    expect(src).toMatch(/is_premium/);
  });

  it('the send route re-checks premium at tap time, not just at draft time', () => {
    const src = code(sendRoute);
    expect(src).toMatch(/is_premium/);
    // And it must REFUSE, not merely read the flag.
    expect(src).toMatch(/403/);
    expect(src).toMatch(/not_premium/);
  });

  it('a lapsed student closes the draft instead of leaving it sendable', () => {
    // Otherwise the card sits on the mentor's screen failing on every tap,
    // which reads as a broken button rather than an expired subscription.
    const src = code(sendRoute);
    const gate = src.slice(src.indexOf('is_premium'), src.indexOf('not_premium'));
    expect(gate).toMatch(/dismissed_at/);
  });
});
