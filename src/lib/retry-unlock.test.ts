import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// The admin retry-unlock route completes a stuck premium grant. Its safety
// rests on two properties: it may never become a second, unsigned path to turn
// money on, and it may never grant premium for a payment that did not buy a
// subscription. These guards lock both in source, the same way razorpay.test.ts
// locks the webhook's.
//
// COMMENTS ARE STRIPPED BEFORE MATCHING, and this file is why. On 26 Aug the
// route gained a comment explaining that activatePaidOrder() early-returns for
// a ₹299 row — and the guard below, which asserts the route does NOT CALL
// activatePaidOrder, failed on the sentence describing why it doesn't. Fifth
// time this repo has been bitten by a guard reading prose as code. A test that
// cannot tell an implementation from a description of one is not a guard.
const code = (p: string) =>
  readFileSync(p, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

const route = code('src/app/api/admin/retry-unlock/route.ts');

describe('retry-unlock cannot become a signature bypass', () => {
  it('requires an admin', () => {
    expect(route).toContain("role !== 'admin'");
  });

  it('refuses anything not already captured — never flips created→paid', () => {
    expect(route).toContain("pay.status !== 'paid'");
  });

  it('never flips payment state: it does not activate a payment, only grants premium', () => {
    // It must NOT call the activation path (which writes payment→paid). The only
    // state it may touch is the idempotent premium grant.
    expect(route).not.toContain('activatePaidOrder');
    expect(route).not.toContain('activate_payment');
    expect(route).toContain('grantPremiumAndQueueBuddy');
  });

  it('is idempotent — an already-premium student is a no-op', () => {
    expect(route).toContain('alreadyPremium');
  });

  it('gates on the PLAN through the shared allow-list, not a local deny-list', () => {
    // The behaviour is proved by execution in
    // src/app/api/admin/retry-unlock/retry-unlock.behaviour.test.ts. What this
    // pins is the SHAPE: the check must go through isPlanId — the same single
    // authority create-order uses — so the two doors cannot drift, and a new
    // non-subscription product is refused without anyone editing this route.
    expect(route).toContain('isPlanId(pay.plan)');
    expect(route, 'a deny-list would need editing per product').not.toMatch(/plan\s*!==\s*['"]session['"]/);
  });
});
