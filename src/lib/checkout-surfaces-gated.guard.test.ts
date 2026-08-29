import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ── EVERY CHECKOUT SURFACE MUST PASS THE ORIGIN GATE ────────────────────────
//
// These three components have drifted before: only two emit
// payment_order_created, and only two share the duplicate-order reuse guard —
// which is why one student minted three ₹299 session orders in nine minutes.
// A payment rule that lives in three files is a payment rule that will hold in
// two of them, and the one it fails in is invisible until a student cannot pay.
//
// This is a source guard, so it proves WIRING, not behaviour — the behaviour is
// proven in payment-origin.test.ts and checkout-origin-guard.test.ts. Its job
// is to fail the build when a FOURTH surface appears, or when someone removes
// the gate from one of these three.

const SURFACES: Array<[string, string]> = [
  ['src/components/membership-card.tsx', 'profile'],
  ['src/components/unlock-buddy-sheet.tsx', 'buddy'],
  ['src/components/buddy/book-session-card.tsx', 'buddy'],
];

describe('every checkout surface is gated on a transactable origin', () => {
  it.each(SURFACES)('%s gates before minting an order', (file, dest) => {
    const src = readFileSync(file, 'utf8');
    expect(src).toContain(`ensureTransactableOrigin('${dest}')`);

    // ORDER MATTERS, and this is the assertion that carries the risk: a
    // hand-off AFTER the order exists strands a live Razorpay order on a
    // domain that can never pay it, and the student returns to a paywall that
    // silently reuses the dead order for the next 30 minutes.
    const gateAt = src.indexOf('ensureTransactableOrigin(');
    const mintAt = Math.min(
      ...[`fetch('/api/payments/create-order'`, `fetch('/api/sessions/book', {`]
        .map((n) => src.indexOf(n)).filter((i) => i >= 0),
    );
    expect(gateAt).toBeGreaterThan(-1);
    expect(mintAt).toBeGreaterThan(gateAt);
  });

  it('the gate is reached by returning, so a moved page never also mints', () => {
    for (const [file] of SURFACES) {
      expect(readFileSync(file, 'utf8')).toMatch(/if \(\(await ensureTransactableOrigin\('(buddy|profile)'\)\)\.move\) return;/);
    }
  });
});
