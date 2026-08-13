import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ── The outbound sales script may only promise what a student can receive ──
//
// Found 13 Aug 2026 while building the Pooja training manual — before a new
// salesperson logged in and started sending this at ~25 conversations/day.
// The generated script carried two claims that did not survive a check
// against the live system:
//
//   A fixed number of free mentor messages, offered to every lead. That
//   mechanic is dormant by design and needs both an env flag and per-grant
//   admin activation. Live count that day: 20 grants recorded, zero
//   activated — so no recipient of this message could have collected it.
//
//   "No risk", attached to the refund. The guarantee is real but carries a
//   logged-study-days condition on the public refunds page. Stating the
//   promise without its condition is the same failure in a friendlier voice.
//
// This is the one script in the product that a human sends by hand, at
// volume, to people who have not bought yet. It is the last place an
// unbacked promise should survive.

const FILE = 'src/lib/sales-queue.ts';
const src = () => readFileSync(FILE, 'utf8');

describe('the script never promises the dormant free-message mechanic', () => {
  it('does not offer free messages to leads', () => {
    // Deliberately matched loosely: any resurrection of this offer, in any
    // phrasing, should trip this rather than only the original wording.
    expect(src()).not.toMatch(/free message/i);
  });

  it('the count constant itself is not pulled into the sales path', () => {
    expect(src()).not.toContain('MENTOR_FREE_MESSAGES');
  });
});

describe('the refund is never stated without its condition', () => {
  it('drops the unconditional "no risk" framing', () => {
    expect(src()).not.toMatch(/no risk/i);
  });

  it('states the logged-days condition wherever the refund is mentioned', () => {
    const s = src();
    if (/full refund/i.test(s)) {
      expect(s).toMatch(/20 logged study days/);
    }
  });
});

describe('the price stays pinned to one number until the founder rules', () => {
  it('quotes a single price, not two competing ones', () => {
    // Conflict 1 in docs/POOJA-TRAINING-MANUAL.md: whether the lead price is
    // the monthly plan or the Till-CAT hero is an open founder decision. The
    // failure this guards is the script quietly acquiring BOTH — a lead
    // hearing one number here and reading another in the app is the same
    // claim-vs-delivery gap in a different costume.
    const s = src();
    const quoted = s.match(/Rs [\d,]+/g) ?? [];
    expect(new Set(quoted).size).toBeLessThanOrEqual(1);
  });
});
