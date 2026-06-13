// Membership plans. amountPaise is what Razorpay charges; rupees/display are
// for UI. months drives the renewal-date math on a successful payment.
export const PLANS = {
  monthly:   { id: 'monthly',   label: '1 Month',  amountPaise:  99900, months: 1, display: '₹999' },
  quarterly: { id: 'quarterly', label: '3 Months', amountPaise: 249900, months: 3, display: '₹2,499' },
  halfyear:  { id: 'halfyear',  label: '6 Months', amountPaise: 449900, months: 6, display: '₹4,499' },
} as const;

export type PlanId = keyof typeof PLANS;

export function isPlanId(value: string): value is PlanId {
  return value === 'monthly' || value === 'quarterly' || value === 'halfyear';
}
