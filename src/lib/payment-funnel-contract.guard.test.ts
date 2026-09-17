import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { codeOnly } from './test-support/code-only';
import { FUNNEL_ORDER_KEY, funnelOrderId } from './payment-funnel';
import { checkoutFailureProps } from './payment-failure';

// ── THE WHOLE PIPE, NOT ONE END OF IT ───────────────────────────────────────
//
// `payment-funnel-emission.guard.test.ts` asserted that every checkout surface
// calls payFunnel with an `orderId`. It passed. The pipeline was broken anyway,
// because the ingestion route stored that value under `order_id` and
// revenue-ops read it back as `orderId`.
//
// Measured 17 Sep 2026 across 87 production funnel rows: 42 carried `order_id`,
// **0 carried `orderId`**. So the join deciding whether an abandoned checkout is
// our defect or the student's decision matched nothing, and every abandoned
// order fell through to "never reached Razorpay" — a false accusation against
// our own product, produced by the code written to stop false accusations.
//
// The green test was the problem. It protected the WRITER, not the CONTRACT:
// client → API → database → consumer. A test that checks one end of a pipe
// tells you that end still exists, and nothing about whether it connects.
//
// These tests check the connection.

const read = (p: string) => codeOnly(readFileSync(join(process.cwd(), p), 'utf8'));
const ROUTE = 'src/app/api/analytics/payment-funnel/route.ts';
const CONSUMER = 'src/lib/os/revenue-ops.ts';
const DEFINITION = 'src/lib/payment-funnel.ts';

describe('one spelling of the order key, end to end', () => {
  it('the writer stores it through the shared constant', () => {
    const route = read(ROUTE);
    expect(route, 'the route must import the key, never spell it').toMatch(/FUNNEL_ORDER_KEY/);
    expect(route, 'a literal key here is how the two ends diverged')
      .not.toMatch(/['"]order_?[iI]d['"]\s*:/);
  });

  it('the consumer reads it through the shared accessor', () => {
    const consumer = read(CONSUMER);
    expect(consumer).toMatch(/funnelOrderId\s*\(/);
    expect(consumer, 'reading metadata.orderId directly is the original defect')
      .not.toMatch(/metadata[^\n]*\.orderId/);
    expect(consumer).not.toMatch(/\[['"]orderId['"]\]/);
  });

  it('the accessor reads exactly the key the writer writes', () => {
    // The behavioural half: not "both files mention a constant" but "a value
    // stored under the written key is retrievable by the reader".
    const stored: Record<string, unknown> = { [FUNNEL_ORDER_KEY]: 'order_ABC123' };
    expect(funnelOrderId(stored)).toBe('order_ABC123');
  });

  it('the accessor refuses the spelling that broke production', () => {
    expect(funnelOrderId({ orderId: 'order_ABC123' })).toBeNull();
    expect(funnelOrderId(null)).toBeNull();
    expect(funnelOrderId({ [FUNNEL_ORDER_KEY]: '' })).toBeNull();
    expect(funnelOrderId({ [FUNNEL_ORDER_KEY]: 42 })).toBeNull();
  });

  it('the key is defined once, beside the events it belongs to', () => {
    const def = read(DEFINITION);
    expect(def).toMatch(/export const FUNNEL_ORDER_KEY = 'order_id'/);
    expect(def).toMatch(/export function funnelOrderId/);
  });
});

describe('what Razorpay reported survives the journey', () => {
  const route = read(ROUTE);

  it('every field checkoutFailureProps produces is forwarded by the route', () => {
    // The route's allow-list carried `reason` alone, so five of six fields were
    // computed on the device and thrown away at the door — while the commit
    // message claimed the error was preserved verbatim.
    const produced = Object.keys(checkoutFailureProps({
      error: { code: 'BAD_REQUEST_ERROR', description: 'd', source: 'customer', step: 'payment_authentication', reason: 'r', metadata: { payment_id: 'pay_1' } },
    }));
    expect(produced.length).toBeGreaterThan(1);
    for (const field of produced) {
      expect(route, `checkoutFailureProps emits "${field}" and the route must forward it`)
        .toMatch(new RegExp(`['"]${field}['"]`));
    }
  });

  it('still bounds every stored string', () => {
    // Preserving more fields must not mean storing unbounded client text.
    expect(route).toMatch(/slice\(0,\s*\w+\)/);
  });
});

describe('the consumer joins on a key that can actually match', () => {
  const consumer = read(CONSUMER);

  it('compares the stored key against the ledger\'s own order id', () => {
    expect(consumer).toMatch(/razorpay_order_id/);
    expect(consumer).toMatch(/orderIds\.includes\(oid\)/);
  });

  it('treats a missing order id as no evidence, never as a classification', () => {
    // An event that cannot be attributed must not become "never reached
    // Razorpay" — that is the false accusation this whole file exists for.
    expect(consumer).toMatch(/oid == null \|\| !orderIds\.includes\(oid\)/);
  });
});
