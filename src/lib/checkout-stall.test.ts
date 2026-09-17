import { describe, it, expect } from 'vitest';
import {
  checkoutStall, stallDetail, STALL_META, FUNNEL_INSTRUMENTED_FROM,
  ORDER_ATTRIBUTION_FROM,
  type CheckoutStall, type StallEvent,
} from './checkout-stall';

const ev = (...names: string[]): StallEvent[] => names.map((event) => ({ event }));
const RECENT = '2026-09-10T10:00:00.000Z';
const OLD = '2026-08-04T10:00:00.000Z';

describe('the four populations Revenue Operations used to call one thing', () => {
  it('a failed attempt outranks everything else that happened', () => {
    // They got far enough to be refused. That is the moment that decided it,
    // whatever else the session contains.
    expect(checkoutStall(RECENT, ev('payment_checkout_opened', 'payment_checkout_dismissed', 'payment_failed')))
      .toBe('attempt_failed');
  });

  it('navigated away with no return is its own failure, and it is ours', () => {
    expect(checkoutStall(RECENT, ev('payment_checkout_opened', 'payment_checkout_navigating')))
      .toBe('left_and_never_returned');
    expect(STALL_META.left_and_never_returned.ours).toBe(true);
  });

  it('a dismissal recorded before the hand-off does not mask the hand-off', () => {
    // The redirect path can leave a modal dismissal behind on the way out.
    // Reading that as "they chose to close it" would blame the student for our
    // lost hand-off — the exact misattribution this ordering exists to stop.
    expect(checkoutStall(RECENT, ev('payment_checkout_dismissed', 'payment_checkout_navigating')))
      .toBe('left_and_never_returned');
  });

  it('coming back from Razorpay is not a lost hand-off', () => {
    expect(checkoutStall(RECENT, ev('payment_checkout_navigating', 'payment_checkout_returned', 'payment_checkout_dismissed')))
      .toBe('closed_checkout');
  });

  it('saw the price and closed it is the student deciding, not us failing', () => {
    expect(checkoutStall(RECENT, ev('payment_checkout_opened', 'payment_checkout_dismissed'))).toBe('closed_checkout');
    expect(STALL_META.closed_checkout.ours).toBe(false);
  });

  it('opened with nothing after it is not called an abandonment', () => {
    expect(checkoutStall(RECENT, ev('payment_cta_clicked', 'payment_checkout_opened'))).toBe('opened_no_outcome');
  });

  it('an order that never showed a window is ours to fix', () => {
    expect(checkoutStall(RECENT, ev('payment_cta_clicked'))).toBe('never_reached_checkout');
    expect(STALL_META.never_reached_checkout.ours).toBe(true);
  });
});

describe('absence of an event is only evidence when the event existed', () => {
  it('an order predating the instrumentation is never called a product failure', () => {
    // Concluding "never reached Razorpay" from a pre-August silence would
    // invent a bug out of a deployment date.
    expect(checkoutStall(OLD, [])).toBe('not_instrumented');
  });

  it('an order after the cutover with no events IS a product failure', () => {
    expect(checkoutStall(RECENT, [])).toBe('never_reached_checkout');
  });

  it('an old order that DID emit events is read normally, not written off', () => {
    expect(checkoutStall(OLD, ev('payment_checkout_opened', 'payment_checkout_dismissed'))).toBe('closed_checkout');
  });

  it('the cutover day itself counts as instrumented', () => {
    expect(checkoutStall(`${FUNNEL_INSTRUMENTED_FROM}T09:00:00.000Z`, [])).toBe('never_reached_checkout');
  });
});

describe('what the founder reads on the card', () => {
  const ALL: CheckoutStall[] = [
    'attempt_failed', 'left_and_never_returned', 'closed_checkout',
    'opened_no_outcome', 'never_reached_checkout', 'not_instrumented',
  ];

  it('every stall has a label and an action', () => {
    for (const s of ALL) {
      expect(STALL_META[s].label, s).toBeTruthy();
      expect(STALL_META[s].detail.length, s).toBeGreaterThan(40);
    }
  });

  it('names the stall before explaining it', () => {
    expect(stallDetail('never_reached_checkout')).toMatch(/^Never reached Razorpay — /);
  });

  it('never tells the founder a checkout was seen when it was not', () => {
    // The sentence this replaced asserted "Opened checkout and left" for every
    // abandoned order, including the ones that never reached Razorpay.
    for (const s of ['never_reached_checkout', 'not_instrumented'] as const) {
      expect(stallDetail(s), s).not.toMatch(/opened checkout|saw the price/i);
    }
  });

  it('says plainly when we do not know', () => {
    expect(stallDetail('not_instrumented')).toMatch(/do not know/i);
  });
});

describe('per-order attribution has its own, later cutover', () => {
  it('an order from before orderId was universal joins to nothing and says so', () => {
    // The events existed from 25 Aug, but two surfaces emitted the dismissal
    // with no orderId. A stall derived from a join that could not succeed is a
    // product bug invented out of a missing field.
    expect(checkoutStall('2026-09-10T10:00:00.000Z', [], ORDER_ATTRIBUTION_FROM)).toBe('not_instrumented');
  });

  it('an order from the attribution cutover onward is classified for real', () => {
    expect(checkoutStall(`${ORDER_ATTRIBUTION_FROM}T10:00:00.000Z`, [], ORDER_ATTRIBUTION_FROM))
      .toBe('never_reached_checkout');
  });

  it('the attribution cutover is never earlier than the events themselves', () => {
    expect(ORDER_ATTRIBUTION_FROM >= FUNNEL_INSTRUMENTED_FROM).toBe(true);
  });
});
