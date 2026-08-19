// ── The IIM Buddy funnel, counted from events that already exist ───────────
//
// Founder, 19 Aug: "Don't ask 'did ₹299 convert?'. Ask how many saw it, how
// many clicked, how many reached checkout, how many paid, why non-buyers
// stopped, which trigger produced the highest intent, did buyers return."
//
// None of that needed new instrumentation — every event below has been
// recording for weeks. What was missing was somewhere to read them together.
//
// TWO THINGS THIS DELIBERATELY DOES NOT DO.
//
// It does not compute a conversion RATE when the denominator is tiny. With
// three clicks, "0% conversion" is a number that reads as a finding and is
// not one; the offer went live on 17 Aug with no promotion behind it. Counts
// are shown, ratios appear only past MIN_FOR_RATE, and below it the view says
// so in words. This is the same rule the metric work has been enforcing all
// week, applied to the founder's own dashboard.
//
// It does not guess WHY someone stopped. A dismissal at the pay sheet is
// recorded as a dismissal — not as a "price objection", which nobody told us.

export const MIN_FOR_RATE = 30;

/** Ordered steps. Each name is an event already in journey.ts. */
export const BUDDY_FUNNEL_STEPS = [
  { key: 'buddy_nudge_shown', label: 'Intervention shown', note: 'Rai surfaced a reason to talk to someone' },
  { key: 'buddy_unlock_open', label: 'Buddy sheet opened', note: 'Student went looking on their own' },
  { key: 'buddy_nudge_cta', label: 'Intervention clicked', note: 'From the nudge, not the menu' },
  { key: 'session_book_click', label: '₹299 clicked', note: 'Single session' },
  { key: 'pay_checkout_opened', label: 'Checkout opened', note: 'Any plan' },
  { key: 'pay_order_created', label: 'Order created', note: 'Reached the payment provider' },
  { key: 'session_pay_dismissed', label: 'Dismissed at pay sheet', note: 'Reason unknown — we do not ask' },
  { key: 'pay_dismissed', label: 'Dismissed at checkout', note: 'Reason unknown' },
  { key: 'session_pay_success', label: 'Session paid', note: '' },
] as const;

export interface FunnelStepCount {
  key: string;
  label: string;
  note: string;
  events: number;
  people: number;
  firstSeen: string | null;
  lastSeen: string | null;
}

export interface BuddyFunnel {
  steps: FunnelStepCount[];
  /** Real money, from the ledger — never inferred from client events. */
  paidSessions: number;
  paidAny: number;
  /** True when every step is below the threshold at which a rate means anything. */
  tooEarlyForRates: boolean;
}

export function ratesAreMeaningful(steps: FunnelStepCount[]): boolean {
  const entry = steps.find((s) => s.key === 'session_book_click');
  return (entry?.people ?? 0) >= MIN_FOR_RATE;
}

/**
 * A percentage, or null when the base is too small to state one.
 *
 * Returning null rather than a number is the whole point: a rate over three
 * people is not a rate, and rendering "0%" would put a finding on screen that
 * the data cannot support.
 */
export function rateOrNull(numerator: number, denominator: number): number | null {
  if (denominator < MIN_FOR_RATE) return null;
  return Math.round((numerator / denominator) * 100);
}
