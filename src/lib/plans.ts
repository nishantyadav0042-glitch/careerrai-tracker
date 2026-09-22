// ── THE PRICING AUTHORITY ───────────────────────────────────────────────────
//
// CareerRai sells exactly THREE things. This file is where their prices are
// defined, and it is the only place any of them may be defined. Every other
// module — checkout, Razorpay, receipts, UI, admin, analytics — derives from
// here. A second file that states a price is a second answer to "what does
// this cost", and Incident #23 is what happens to rules that live in N places.
//
//     Single session   ₹499  →  ₹399     SESSION_PRICING (below)
//     Monthly          ₹1,299 → ₹999     PLANS.monthly
//     Till CAT day     ₹3,999 → ₹1,599   PLANS.tillcat
//
// TILL CAT CUT 2,599 → 1,599 ON 22 SEP 2026, and the reason is the calendar
// rather than a campaign. Founder: "we are now in September end and 2599 is
// more amount than per month 999 as CAT is in November end." He is right, and
// the old price had quietly become irrational: with roughly two months left to
// the exam, Till CAT at 2,599 cost MORE than buying the two months it covers
// at 999 each. A student doing that arithmetic finds the hero plan is the
// expensive one, and the honest response is to move the price, not the copy.
//
// `months` is deliberately NOT cut with it. Four months from today runs past
// CAT, which over-delivers; two months would expire in late November, which
// would break the one promise the product's name makes.
//
// Founder, 27 Aug 2026. There is no annual plan, no quarterly, no half-year
// and no campaign price. Those existed and are gone: quarterly and half-year
// were never bought by anyone (production: zero payments, zero subscribers)
// and the Independence Day campaign price had already expired. Leaving any
// of them in the config would leave an obsolete price in an active code path.
//
// TWO NUMBERS PER PRODUCT, AND ONLY ONE OF THEM IS MONEY.
//   · offerPaise — what is charged. The only number Razorpay ever sees.
//   · listPaise  — the struck-through anchor. Display only. It is never
//                  charged, never sent to a payment provider, and no
//                  calculation may read it. A product with no anchor sets it
//                  to null and no strike is drawn; inventing an anchor to make
//                  a discount look bigger would be a precise lie, which is the
//                  one thing this codebase refuses to print (Law L1).
//
// months drives the renewal-date math after a successful payment. Key order is
// display order.
export const PLANS = {
  // 'Till CAT' is the hero (founder, 24 Jul): with the exam a season away, the
  // buyer's mental unit is "till CAT", not "months". One payment, buddy all the
  // way to exam day — it removes the monthly churn decision at exactly the
  // moment the runway is short. months:4 ≈ late-July → late-Nov (CAT).
  tillcat: {
    id: 'tillcat', label: 'Till CAT', months: 4,
    offerPaise: 159900, display: '₹1,599',
    listPaise:  399900, listDisplay: '₹3,999',
    tagline: 'Your buddy till exam day', recommended: true, journey: true,
  },
  monthly: {
    id: 'monthly', label: '1 Month', months: 1,
    offerPaise:  99900, display: '₹999',
    listPaise:  129900, listDisplay: '₹1,299',
    tagline: 'Month to month', recommended: false, journey: false,
  },
} as const;

export type PlanId = keyof typeof PLANS;

export function isPlanId(value: string): value is PlanId {
  return Object.prototype.hasOwnProperty.call(PLANS, value);
}

/**
 * The single 1:1 session. Priced here beside the plans rather than in
 * session-credit.ts, so that "what does CareerRai charge" has one answer in one
 * file. session-credit.ts re-exports SESSION_PRICE_PAISE from this, which keeps
 * its existing importers working without giving them a second definition.
 */
export const SESSION_PRICING = {
  id: 'session',
  label: 'Single session',
  offerPaise: 39900, display: '₹399',
  listPaise:  49900, listDisplay: '₹499',
} as const;

/** Every product that can be bought, for guards that must cover all of them. */
export const ALL_PRODUCTS = [
  ...Object.values(PLANS).map((p) => ({ id: p.id as string, offerPaise: p.offerPaise, listPaise: p.listPaise as number | null, display: p.display, listDisplay: p.listDisplay as string | null })),
  { id: SESSION_PRICING.id, offerPaise: SESSION_PRICING.offerPaise, listPaise: SESSION_PRICING.listPaise as number | null, display: SESSION_PRICING.display, listDisplay: SESSION_PRICING.listDisplay as string | null },
] as const;

// Bug audit (14 July): `date.setMonth(date.getMonth() + n)` overflows into
// the NEXT month whenever the target month is shorter than the current
// day-of-month — e.g. Jan 31 + 1 month rolls to Mar 2/3, not Feb 28, because
// JS clamps the invalid "Feb 31" forward. That silently pushed
// subscription_renews_at a few days late (small, in the student's favor,
// but wrong — and compounds across renewals for anyone paying on the 29-31st).
// This clamps the day to the target month's actual last day instead.
export function addMonthsClamped(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const targetMonth = d.getMonth() + months;
  const lastDayOfTargetMonth = new Date(d.getFullYear(), targetMonth + 1, 0).getDate();
  d.setDate(Math.min(d.getDate(), lastDayOfTargetMonth));
  d.setMonth(targetMonth);
  return d;
}
