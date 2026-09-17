// ── WHERE AN ABANDONED CHECKOUT ACTUALLY STOPPED ────────────────────────────
//
// Revenue Operations showed every `status='created'` order with one sentence:
// "Opened checkout and left. A real payment would have auto-confirmed — this
// is a sales follow-up." That sentence is a guess, and measured 16 Sep 2026 it
// is wrong for a large share of the 51 abandoned orders: 37 students created
// one, but only 29 ever emitted a checkout-opened event, and on the redirect
// leg 8 students navigated to Razorpay while exactly 1 came back.
//
// Those are three different failures wearing one label:
//
//   · never reached Razorpay        → OUR bug. Fix the product.
//   · left for Razorpay, never back → OUR bug, and a different one.
//   · saw the price and closed it   → price, trust or timing. Go ask them.
//   · tried to pay and it failed    → the bank or the method. Help them retry.
//
// `payment-funnel.ts` was built in August precisely to tell these apart, and
// its own header says so. The events were collected and then never read by the
// one screen the founder uses to decide who to chase. This module reads them.
//
// THE HONESTY RULE, and it is the whole reason this is a module and not an
// inline ternary: ABSENCE OF AN EVENT IS ONLY EVIDENCE WHEN THE EVENT EXISTED.
// An order from 4 August has no checkout event and never will. Concluding
// "never reached Razorpay" from that silence would invent a product bug out of
// a deployment date — so orders that predate the instrumentation return
// `not_instrumented` and say so on the card.

/** The first day `analytics_events` carried any payment funnel event. */
export const FUNNEL_INSTRUMENTED_FROM = '2026-08-25';

/**
 * The first day every funnel event carries the order it belongs to.
 *
 * Separate from the constant above, and the difference matters. The events
 * existed from 25 August, but two of the three checkout surfaces emitted
 * `payment_checkout_dismissed` with no `orderId`, so an event could be seen
 * and still not be attached to the order it described. Anything older than
 * this joins to nothing — and a stall derived from a join that could not
 * succeed would be a product bug invented out of a missing field.
 */
export const ORDER_ATTRIBUTION_FROM = '2026-09-16';

export type CheckoutStall =
  | 'attempt_failed'
  | 'left_and_never_returned'
  | 'closed_checkout'
  | 'opened_no_outcome'
  | 'never_reached_checkout'
  | 'not_instrumented';

export interface StallMeta {
  label: string;
  /** What the founder should do with this one. */
  detail: string;
  /** True when the stall points at us rather than at the student's decision. */
  ours: boolean;
}

export const STALL_META: Record<CheckoutStall, StallMeta> = {
  attempt_failed: {
    label: 'Payment attempt failed',
    detail: 'They tried to pay and Razorpay refused the attempt. Check the recorded reason, then help them retry.',
    ours: false,
  },
  left_and_never_returned: {
    label: 'Left for Razorpay, never came back',
    detail: 'We handed the page to Razorpay and nothing came back. This is a hand-off failure on our side, not a decision they made.',
    ours: true,
  },
  closed_checkout: {
    label: 'Saw the price and closed it',
    detail: 'The payment window opened and they deliberately closed it. Nothing is broken — this is price, trust or timing, and only they can tell you which.',
    ours: false,
  },
  opened_no_outcome: {
    label: 'Opened checkout, no outcome recorded',
    detail: 'The window opened and we never saw a close, a failure or a payment. They may still be mid-payment, or the tab died with them in it.',
    ours: false,
  },
  never_reached_checkout: {
    label: 'Never reached Razorpay',
    detail: 'An order was minted and no payment window was ever shown. The student could not have paid if they wanted to — this is ours to fix.',
    ours: true,
  },
  not_instrumented: {
    label: 'Not instrumented',
    detail: `This order predates the funnel events (${FUNNEL_INSTRUMENTED_FROM}). We do not know where it stopped, and nothing here will tell us.`,
    ours: false,
  },
};

/** One funnel event belonging to an order. */
export interface StallEvent {
  event: string;
  at?: string;
}

/**
 * Where this order stopped.
 *
 * ORDER OF PRECEDENCE, and each step is a claim about the student's
 * experience rather than about our data:
 *
 *  1. A failed attempt outranks everything. They got far enough to be refused,
 *     and that is the moment that decided it.
 *  2. Then the redirect leg: navigated away with no matching return. This has
 *     to beat "closed checkout", because a dismissal recorded before the
 *     hand-off describes a modal they closed on the way to a different path.
 *  3. Then a deliberate close, which is the only stall that is genuinely the
 *     student's decision rather than our defect.
 *  4. Then "opened, nothing since" — live, or silently lost.
 *  5. Only then absence, and only if the events existed to be absent.
 */
export function checkoutStall(
  orderCreatedAt: string,
  events: readonly StallEvent[],
  attributableFrom: string = FUNNEL_INSTRUMENTED_FROM,
): CheckoutStall {
  const has = (e: string) => events.some((x) => x.event === e);

  if (has('payment_failed')) return 'attempt_failed';
  if (has('payment_checkout_navigating') && !has('payment_checkout_returned')) return 'left_and_never_returned';
  if (has('payment_checkout_dismissed')) return 'closed_checkout';
  if (has('payment_checkout_opened')) return 'opened_no_outcome';

  // Nothing observed. Distinguish "the product failed them" from "we were not
  // watching yet" — the whole reason this function refuses to be a ternary.
  if (events.length === 0 && orderCreatedAt.slice(0, 10) < attributableFrom) return 'not_instrumented';
  return 'never_reached_checkout';
}

/** The sentence shown on the Revenue Operations card. */
export function stallDetail(stall: CheckoutStall): string {
  return `${STALL_META[stall].label} — ${STALL_META[stall].detail}`;
}
