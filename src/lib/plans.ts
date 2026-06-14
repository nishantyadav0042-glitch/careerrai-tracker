// Membership plans, framed around the CAT journey — not a monthly bill.
// The longer commitments are the heroes: one decision aligned with how a student
// already thinks about the exam (a season of their life), which removes the
// monthly churn coin-flip without an auto-debit mandate. Monthly stays as a
// fallback for those who insist on it.
//
// amountPaise is what Razorpay charges; display is for UI; months drives the
// renewal-date math on a successful payment. Key order = display order (journey
// plans first, monthly last).
export const PLANS = {
  halfyear:  { id: 'halfyear',  label: '6 Months', amountPaise: 449900, months: 6, display: '₹4,499', tagline: 'The whole journey to CAT', recommended: true,  journey: true  },
  quarterly: { id: 'quarterly', label: '3 Months', amountPaise: 249900, months: 3, display: '₹2,499', tagline: 'One season of prep',       recommended: false, journey: true  },
  monthly:   { id: 'monthly',   label: '1 Month',  amountPaise:  99900, months: 1, display: '₹999',   tagline: 'Month to month',            recommended: false, journey: false },
} as const;

export type PlanId = keyof typeof PLANS;

export function isPlanId(value: string): value is PlanId {
  return value === 'monthly' || value === 'quarterly' || value === 'halfyear';
}
