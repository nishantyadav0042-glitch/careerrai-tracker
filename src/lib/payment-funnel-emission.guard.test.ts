import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { codeOnly } from '@/lib/test-support/code-only';
import { PAYMENT_FUNNEL_EVENTS } from './payment-funnel';

// ── A FUNNEL STAGE NOBODY EMITS IS A ZERO NOBODY QUESTIONS ──────────────────
//
// `payment-funnel.ts` defines the stages and `/admin` renders them. Nothing
// ever checked that the stages are actually WRITTEN, and measured 16 Sep 2026
// two of them never had been:
//
//   · `payment_failed` — all three checkout surfaces registered Razorpay's
//     `payment.failed` listener and wrote it to `student_events` as
//     `pay_failed`, never to `analytics_events`. The funnel's "Payment failed"
//     row has therefore read 0 since August. It reads as "no payment problems"
//     and means "not wired" — Incident #95's shape exactly: a plausible zero.
//   · `paywall_viewed` — no emission site anywhere. The one stage that says
//     how many students were ever shown a price, blank, so every rate below it
//     was computed against order_created instead.
//
// Three more defects in the same event, `KEY_SPLIT_EVENT` itself:
//
//   · `payment_checkout_opened` fired unconditionally BEFORE the redirect
//     branch and AGAIN inside it, so redirect users were counted twice. The
//     ledger held 28 orders against 41 "checkout shown" events — more windows
//     than orders, which is impossible and was the tell nobody read.
//   · It fired before `rzp.open()`, so it claimed a window had been shown at a
//     point where the call could still throw.
//   · Two of the three surfaces emitted it with no `orderId`, so no dismissal
//     could be joined to the order it abandoned.
//
// That event exists to split "never reached Razorpay" from "reached it and
// left" — two populations needing opposite fixes. The split was wrong in three
// ways at once, and the only reason anyone looked is that the founder asked
// why 51 orders were abandoned.

const CHECKOUTS = {
  'membership-card': 'src/components/membership-card.tsx',
  'unlock-buddy-sheet': 'src/components/unlock-buddy-sheet.tsx',
  'book-session-card': 'src/components/buddy/book-session-card.tsx',
} as const;

const src = (p: string) => codeOnly(readFileSync(join(process.cwd(), p), 'utf8'));

/** Events that fire before any order exists, so they cannot carry an orderId. */
const PRE_ORDER: readonly string[] = ['paywall_viewed', 'payment_cta_clicked'];

/** Every non-test source file, for "is this stage emitted anywhere at all". */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { sourceFiles(full, out); continue; }
    if (!/\.tsx?$/.test(name) || /\.(test|guard\.test)\.tsx?$/.test(name)) continue;
    if (full.endsWith('src/lib/payment-funnel.ts')) continue; // the definition, not an emission
    out.push(full);
  }
  return out;
}

describe('every funnel stage is actually written by something', () => {
  const all = sourceFiles(join(process.cwd(), 'src')).map((f) => codeOnly(readFileSync(f, 'utf8'))).join('\n');

  for (const event of PAYMENT_FUNNEL_EVENTS) {
    it(`${event} has at least one emission site`, () => {
      const emitted = new RegExp(`(payFunnel|emitPaymentFunnel)\\s*\\([^)]*['"]${event}['"]`).test(all);
      expect(emitted,
        `${event} is a stage the funnel renders but nothing emits. It will show 0 forever, `
        + 'which reads as "healthy" and means "not instrumented".').toBe(true);
    });
  }
});

describe('every checkout surface emits the whole client-side funnel', () => {
  for (const [name, path] of Object.entries(CHECKOUTS)) {
    const code = src(path);

    it(`${name} records intent before the network call`, () => {
      expect(code).toMatch(/payFunnel\(\s*'payment_cta_clicked'/);
    });

    it(`${name} records that a payment window was shown`, () => {
      expect(code).toMatch(/payFunnel\(\s*'payment_checkout_opened'/);
    });

    it(`${name} records a deliberate close`, () => {
      expect(code).toMatch(/payFunnel\(\s*'payment_checkout_dismissed'/);
    });

    it(`${name} sends Razorpay's failure to the funnel, not only to journey`, () => {
      // track('pay_failed') writes student_events. The funnel reads
      // analytics_events. Writing only the first leaves the stage at zero.
      if (!/rzp\.on\(\s*'payment\.failed'/.test(code)) return;
      expect(code,
        `${name} listens for payment.failed but never emits payment_failed to the funnel`)
        .toMatch(/payFunnel\(\s*'payment_failed'/);
    });

    it(`${name} names the order on every event that has one`, () => {
      const calls = [...code.matchAll(/payFunnel\(\s*'([a-z_]+)'\s*,\s*\{([^}]*)\}/g)];
      expect(calls.length, `no payFunnel calls found in ${name} — did the helper get renamed?`).toBeGreaterThan(0);
      for (const [, event, props] of calls) {
        if (PRE_ORDER.includes(event)) continue;
        expect(props, `${name} emits ${event} without an orderId — it cannot be joined to the order it describes`)
          .toMatch(/orderId/);
      }
    });
  }
});

describe('the split event is emitted once, and only once a window really opened', () => {
  for (const [name, path] of Object.entries(CHECKOUTS)) {
    const code = src(path);

    it(`${name} does not emit it before the redirect branch decides`, () => {
      // The original fault: one unconditional emission above the branch plus
      // one inside it, double-counting every redirect user.
      const first = code.indexOf("payFunnel('payment_checkout_opened'");
      const branch = code.indexOf('usesRedirectCheckout(');
      expect(first, `${name} lost its payment_checkout_opened emission`).toBeGreaterThan(-1);
      expect(branch, `${name} lost its redirect branch`).toBeGreaterThan(-1);
      expect(first,
        `${name} emits payment_checkout_opened before the redirect branch, so redirect users are counted twice`)
        .toBeGreaterThan(branch);
    });

    it(`${name} emits the modal-path one only after rzp.open()`, () => {
      const open = code.indexOf('rzp.open();');
      const last = code.lastIndexOf("payFunnel('payment_checkout_opened'");
      expect(open, `${name} lost rzp.open()`).toBeGreaterThan(-1);
      expect(last,
        `${name} claims a payment window was shown before the call that shows it — which can still throw`)
        .toBeGreaterThan(open);
    });
  }
});

describe('Revenue Operations derives the abandonment reason, never asserts one', () => {
  const code = src('src/lib/os/revenue-ops.ts');

  it('classifies each abandoned order instead of labelling them all alike', () => {
    expect(code, 'revenue-ops must read the funnel events, not guess from status=created')
      .toMatch(/checkoutStall\s*\(/);
  });

  it('carries the order id needed to join an order to its events', () => {
    expect(code).toMatch(/razorpay_order_id/);
  });

  it('never hardcodes a sentence claiming a checkout was seen', () => {
    // The sentence this replaced — "Opened checkout and left" — was applied to
    // every abandoned order, including the ones that never reached Razorpay.
    expect(code).not.toMatch(/detail:\s*'[^']*[Oo]pened checkout/);
    expect(code).not.toMatch(/detail:\s*'[^']*saw the price/i);
  });
});
