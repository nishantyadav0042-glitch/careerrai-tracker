/* eslint-disable @typescript-eslint/no-explicit-any */

// ── The commercial middle, finally instrumented ─────────────────────────────
//
// The payment audit found 30 orders and 5 paid, with 24 abandoned sitting in
// ONE undifferentiated bucket. `student_payments` starts at ORDER_CREATED, so
// "never saw Razorpay", "saw it and left", and "the bank declined" are the same
// row shape. Those three need opposite fixes and we could not tell them apart.
//
// No new table: `analytics_events` already exists (student_id, event_type,
// metadata, created_at) and is already written from six places. A second
// analytics store would be a second source of truth for the same question.
//
// HISTORY STAYS UNKNOWN. Nothing here backfills. An order created on 4 August
// has no checkout event and never will, and the funnel must render that as
// NOT INSTRUMENTED rather than inferring a behaviour from a missing row.

export const PAYMENT_FUNNEL_EVENTS = [
  'paywall_viewed',        // the offer was rendered to the student
  'payment_cta_clicked',   // they tapped Pay — intent, before any network call
  'payment_order_created', // our server minted a Razorpay order (server-side)
  'payment_checkout_opened', // the Razorpay modal actually appeared
  'payment_checkout_dismissed', // they closed it without paying
  'payment_failed',        // Razorpay reported a failure
] as const;
export type PaymentFunnelEvent = (typeof PAYMENT_FUNNEL_EVENTS)[number];

export function isPaymentFunnelEvent(v: unknown): v is PaymentFunnelEvent {
  return typeof v === 'string' && (PAYMENT_FUNNEL_EVENTS as readonly string[]).includes(v);
}

/**
 * `payment_checkout_opened` is the one that matters most.
 *
 * It splits the 24 abandoned orders into two populations that need opposite
 * responses: "never saw Razorpay" is a product/platform failure (the iOS
 * hypothesis), "saw it and left" is price, trust or UX. Until this event
 * exists, both look identical in the ledger.
 */
export const KEY_SPLIT_EVENT: PaymentFunnelEvent = 'payment_checkout_opened';

/**
 * Emit one funnel event. Best-effort by design.
 *
 * A telemetry failure must never break a payment. It is logged and shows up as
 * a gap in the funnel — which the Data Quality panel reports honestly — rather
 * than as a failed checkout for a student who was ready to pay.
 */
export async function emitPaymentFunnel(
  admin: any,
  studentId: string,
  event: PaymentFunnelEvent,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    const { error } = await admin.from('analytics_events').insert({
      student_id: studentId,
      event_type: event,
      metadata,
    });
    if (error) console.error(`[payment-funnel] ${event} insert failed:`, error.message);
  } catch (e) {
    console.error(`[payment-funnel] ${event} threw:`, e);
  }
}

export interface FunnelStage {
  event: PaymentFunnelEvent | 'payment_succeeded';
  label: string;
  /** null = the stage exists but we have no data for the window. */
  count: number | null;
  /** false = this stage was never instrumented for the period being shown. */
  instrumented: boolean;
  source: string;
}

/**
 * The funnel for a window, with each stage's evidence named.
 *
 * `payment_succeeded` comes from the payment ledger, not from an analytics
 * event: money is the one thing we observe rather than record.
 */
export async function readPaymentFunnel(
  admin: any,
  sinceIso: string,
): Promise<{ stages: FunnelStage[]; instrumentedFrom: string | null }> {
  const counts = new Map<string, number>();
  let readable = true;

  const { data, error } = await admin
    .from('analytics_events')
    .select('event_type')
    .in('event_type', PAYMENT_FUNNEL_EVENTS as unknown as string[])
    .gte('created_at', sinceIso);
  if (error) {
    console.error('[payment-funnel] read failed:', error.message);
    readable = false;
  } else {
    for (const r of (data ?? []) as any[]) counts.set(r.event_type, (counts.get(r.event_type) ?? 0) + 1);
  }

  // Earliest funnel event ever recorded — the honest boundary before which
  // every stage must read NOT INSTRUMENTED.
  const { data: firstRow } = await admin
    .from('analytics_events')
    .select('created_at')
    .in('event_type', PAYMENT_FUNNEL_EVENTS as unknown as string[])
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  const instrumentedFrom = (firstRow?.created_at as string | null) ?? null;

  const windowPredatesInstrumentation = instrumentedFrom === null || sinceIso < instrumentedFrom;

  const { count: paidCount, error: paidErr } = await admin
    .from('student_payments')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'paid')
    .gte('created_at', sinceIso);

  const stage = (event: PaymentFunnelEvent, label: string): FunnelStage => ({
    event, label,
    count: !readable ? null : (counts.get(event) ?? 0),
    instrumented: !windowPredatesInstrumentation,
    source: 'analytics_events',
  });

  return {
    instrumentedFrom,
    stages: [
      stage('paywall_viewed', 'Saw the offer'),
      stage('payment_cta_clicked', 'Tapped Pay'),
      stage('payment_order_created', 'Order created'),
      stage('payment_checkout_opened', 'Checkout opened'),
      stage('payment_checkout_dismissed', 'Closed checkout'),
      stage('payment_failed', 'Payment failed'),
      {
        event: 'payment_succeeded',
        label: 'Paid',
        count: paidErr ? null : (paidCount ?? 0),
        // Money is observed from the ledger and has always been recorded, so
        // this stage is trustworthy even for windows before instrumentation.
        instrumented: true,
        source: 'student_payments (OBSERVED)',
      },
    ],
  };
}
