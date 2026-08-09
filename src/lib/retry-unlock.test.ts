import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// The admin retry-unlock route completes a stuck premium grant. Its whole
// safety rests on ONE property: it may never become a second, unsigned path to
// turn money on. These guards lock that property in source, the same way
// razorpay.test.ts locks the webhook's.
const route = readFileSync('src/app/api/admin/retry-unlock/route.ts', 'utf8');

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
});
