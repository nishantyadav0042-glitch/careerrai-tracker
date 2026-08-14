// ── GST, on every rupee we take ─────────────────────────────────────────────
//
// Founder, 13 Aug: 18% GST, on the ₹299 session and on ₹999 and everything
// else going forward.
//
// Two decisions are baked in here, and both are reversible by changing one
// flag per plan rather than by hunting through the codebase — which is the
// whole reason this is a module and not arithmetic sprinkled at call sites.
//
// ── DECISION 1: subscription prices are GST-INCLUSIVE ───────────────────────
//
// ₹2,999 stays ₹2,999 at checkout. The tax is carved OUT of it (base ₹2,541 +
// GST ₹458), not added on top.
//
// A student who taps a ₹2,999 button and lands on ₹3,539 has been surprised by
// ₹540 at the exact moment they were deciding, and 77% of our checkouts are
// already abandoned. It would also silently invalidate every price we have
// ever published — the campaign card, the sales script, the Pooja manual.
// Indian consumer pricing is quoted inclusive by convention; we follow it.
//
// ── DECISION 2: the session is GST-EXCLUSIVE, and it has to be ──────────────
//
// The founder's ruling is that the mentor receives ₹299 for a session. If the
// student also paid ₹299, the tax would have to come out of the mentor's fee
// (base ₹253) and the mentor would not receive what they were promised. So
// the session is quoted as ₹299 + GST, and the student pays ₹353.
//
// This is the honest arrangement, and it is worth being explicit that at this
// price CareerRai keeps NOTHING from a session — the entire ₹299 is the
// mentor's and the ₹54 is the government's, so the payment-gateway fee comes
// out of our pocket. That is a defensible choice while the session's job is
// conversion into Till-CAT rather than margin. It is not a mistake, but it
// must be a decision made with open eyes, so it is written down here.

export const GST_RATE = 0.18;

export type TaxMode = 'inclusive' | 'exclusive';

export interface TaxBreakdown {
  /** What the student is actually charged, in paise. The Razorpay amount. */
  grossPaise: number;
  /** The taxable value of the service. */
  basePaise: number;
  /** The tax, which is collected for the government and is never revenue. */
  gstPaise: number;
  rate: number;
  mode: TaxMode;
}

/**
 * Split a price into base + GST.
 *
 * `inclusive` — the quoted price already contains the tax (subscriptions).
 * `exclusive` — the tax is added on top of the quoted price (the session,
 *               where the quoted number is what the mentor must receive).
 *
 * Rounding is done ONCE, on the gross, and the base is derived by
 * subtraction. Rounding both halves independently is how a paise goes missing
 * and a reconciliation report stops balancing.
 */
export function splitTax(quotedPaise: number, mode: TaxMode, rate: number = GST_RATE): TaxBreakdown {
  const quoted = Math.max(0, Math.round(quotedPaise));
  if (mode === 'exclusive') {
    const gross = Math.round(quoted * (1 + rate));
    return { grossPaise: gross, basePaise: quoted, gstPaise: gross - quoted, rate, mode };
  }
  const base = Math.round(quoted / (1 + rate));
  return { grossPaise: quoted, basePaise: base, gstPaise: quoted - base, rate, mode };
}

/** What CareerRai actually keeps, before payment-gateway fees. */
export function netToPlatformPaise(tax: TaxBreakdown, mentorPayoutPaise: number): number {
  return tax.basePaise - Math.max(0, mentorPayoutPaise);
}

/** Rupees, for display. Never used for arithmetic. */
export function rupees(paise: number): string {
  return (paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

/**
 * The line a student must be able to read before they pay.
 *
 * Inclusive plans say so ("incl. GST"); exclusive ones show the addition,
 * because a number that grows between the button and the bank is the single
 * fastest way to lose the trust the diagnostic just earned.
 */
export function taxLine(tax: TaxBreakdown): string {
  return tax.mode === 'inclusive'
    ? `₹${rupees(tax.grossPaise)} (incl. 18% GST)`
    : `₹${rupees(tax.basePaise)} + 18% GST = ₹${rupees(tax.grossPaise)}`;
}

// ── Which plans are quoted inclusive, and which exclusive ───────────────────
//
// One map, so the answer can never differ between the checkout, the stored
// breakdown and the invoice. Subscriptions are inclusive (the published price
// does not move); the session is exclusive (the quoted figure is the mentor's
// fee and must reach them whole).
const EXCLUSIVE_PLANS = new Set<string>(['session']);

export function taxModeForPlan(planId: string): TaxMode {
  return EXCLUSIVE_PLANS.has(planId) ? 'exclusive' : 'inclusive';
}

/** The tax split for a resolved price — the one call sites should use. */
export function taxForPlan(planId: string, resolvedPaise: number): TaxBreakdown {
  return splitTax(resolvedPaise, taxModeForPlan(planId));
}
