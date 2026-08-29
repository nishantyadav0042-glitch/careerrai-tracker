import type { RazorpayPayment } from '@/lib/razorpay';

// ── WHAT RAZORPAY SAID, PRESERVED ───────────────────────────────────────────
//
// Incident #58. Every 15 minutes reconcile-payments asks Razorpay what really
// happened to an unpaid order, and Razorpay answers with the full payment
// entity. Until this module existed we read `status` and binned the rest, so
// the ledger could say a payment failed and could never say why — which is the
// difference between "the iOS app cannot hand off to a UPI app" (ours, urgent,
// expensive) and "the bank declined a card" (not ours, nothing to fix).
//
// This module does ONE thing and deliberately refuses to do a second: it
// copies what Razorpay reported. It does not classify, group, or name a root
// cause. A classifier here would turn `method: 'upi'` into "the app-switch
// bug" on the strength of a guess, and this repo has paid for that mistake
// before. The fields are recorded verbatim; the human reads them.

/** How much of any one Razorpay string we keep. Their descriptions are short;
 *  this is a bound against a pathological value, not a formatting decision. */
export const FIELD_MAX = 200;

export interface PaymentFailureFacts {
  failure_code: string | null;
  failure_description: string | null;
  failure_source: string | null;
  failure_step: string | null;
  failure_method: string | null;
  /** Always set. Records that Razorpay WAS asked — see the migration's note on
   *  why this cannot be inferred from failure_code being null. */
  failure_seen_at: string;
}

function field(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s.length === 0 ? null : s.slice(0, FIELD_MAX);
}

/**
 * The facts to store for an order Razorpay reports as failed.
 *
 * Returns null when NO attempt on the order failed — an order nobody ever
 * tried to pay is not a failed payment, and writing failure columns for it
 * would manufacture a failure that never happened.
 *
 * WHICH ATTEMPT WINS: the LAST failed one in Razorpay's list. A student who
 * tries UPI, then a card, then UPI again has had three different experiences,
 * and the one that decided whether they gave up is the last. Recording the
 * first would describe a moment they had already moved past.
 */
export function failureFacts(
  payments: readonly RazorpayPayment[],
  nowIso: string,
): PaymentFailureFacts | null {
  let last: RazorpayPayment | undefined;
  for (const p of payments) if (p?.status === 'failed') last = p;
  if (!last) return null;

  return {
    failure_code: field(last.error_code),
    failure_description: field(last.error_description),
    failure_source: field(last.error_source),
    failure_step: field(last.error_step),
    failure_method: field(last.method),
    failure_seen_at: nowIso,
  };
}
