import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ── "CAPTURED BUT NEVER UNLOCKED" MUST MEAN NOT DELIVERED ──────────────────
//
// 5 Sep 2026: the founder's Command Center showed three CRITICAL money alerts,
// all month-old, all correctly served, none of which could ever clear:
//
//   · Dhruv Vakadia — ₹299 for a single SESSION. Credit minted, mentor
//     assigned. He was never meant to be premium.
//   · Harsh Rajput / Vedashri kale — ₹999 MONTHLY on 4 Aug. Activation ran
//     (premium_since stamped), they had their month, it lapsed on 4 Sep.
//
// All three carried `premium_since`, which only activation writes, so the
// alert's own root cause ("activation did not complete") was provably false.
// The detector asked `is_premium !== true` and nothing else — a question that
// conflates "never got what they paid for" with "session buyer" and with
// "subscription expired normally". Since a lapsed subscription never becomes
// premium again, the alert was PERMANENT: no action could clear it, which is
// how a P0 interrupt turns into noise the founder scrolls past.
//
// The rule this pins: judge delivery, not current premium state.

const src = readFileSync('src/lib/os/sacred-guard.ts', 'utf8');

describe('the money alert fires only when the student was not served', () => {
  it('judges a subscription on premium_since, not is_premium', () => {
    // premium_since is stamped by activation and never cleared, so it answers
    // "was this EVER granted". is_premium answers "is it granted right now",
    // which a normal expiry also makes false.
    expect(src).toContain('premium_since');
    expect(src).toMatch(/prof\.premium_since !== null/);
  });

  it('judges a session purchase on the credit it should have minted', () => {
    // A ₹299 session buys one credit, never premium.
    expect(src).toContain('SESSION_PLAN_ID');
    expect(src).toContain('session_credits');
    expect(src).toMatch(/creditedPayIds\.has\(pay\.id\)/);
  });

  it('no longer skips solely on is_premium === true', () => {
    // The old line `if (!prof || prof.is_premium === true) continue;` was the
    // whole bug. Its replacement must gate on delivery.
    expect(src).not.toMatch(/if \(!prof \|\| prof\.is_premium === true\) continue/);
    expect(src).toMatch(/if \(delivered\) continue/);
  });

  it('does not tell the founder activation failed when it demonstrably ran', () => {
    // The old root cause asserted "activation did not complete" for every
    // non-premium paid row, including three where premium_since proved it had.
    // Checked against CODE only — the comments in that file quote the old
    // wording deliberately, to record what was wrong and why.
    const code = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(code).not.toContain('activation did not complete');
  });

  it('a session fault is not described as a premium fault', () => {
    // Titling a ₹299 session "premium never unlocked" sends the founder to
    // the wrong remedy entirely.
    expect(src).toMatch(/session credit was never created/);
  });
});
