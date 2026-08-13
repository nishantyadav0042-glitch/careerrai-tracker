import { PLANS, type PlanId } from '@/lib/plans';

// ── THE CAMPAIGN — one config object, every surface reads it ────────────────
//
// Independence Day 2026 (founder, 12 Aug). ₹2,999 → ₹2,499 on the Till-CAT
// plan: a real ₹500 saving, and the buddy stays through exam day. The 3-month
// plan was rejected for this offer because 15 Aug + 3 months ends 15 Nov —
// fourteen days BEFORE CAT (29 Nov), which would take a student's mentor away
// during the final mock-analysis fortnight they were paying for.
//
// CAPACITY IS 50. That is the founder's number, fixed, not derived from
// anything in code. The campaign must never sell more than 50 seats — enforced
// server-side in resolvePrice (the money path), not merely displayed.
//
// This file is PURE: no database, no clock of its own. Every function takes
// `now` and the seats already sold. That is what makes the whole campaign
// testable and what lets it expire on its own with no deploy.

export const CAMPAIGN = {
  id: 'independence-2026',
  /** Only this plan is discounted. Others keep list price. */
  plan: 'tillcat' as PlanId,
  /** ₹2,499 — the founder's price. PLANS.tillcat.amountPaise is ₹2,999. */
  offerPaise: 249900,
  /** Founder's campaign capacity. Fixed. Never recomputed from mentor counts. */
  slots: 50,
  /** 13 Aug 00:00 IST — soft launch. (IST is UTC+5:30.) */
  startsAt: '2026-08-12T18:30:00.000Z',
  /** 15 Aug 23:59:59 IST — closes on Independence Day night, by itself. */
  endsAt: '2026-08-15T18:29:59.000Z',
  label: 'Independence Day offer',
  headline: 'Your IIM buddy — till CAT 2026',
} as const;

export type CampaignPhase = 'before' | 'live' | 'ended';

export function campaignPhase(now: Date): CampaignPhase {
  const t = now.getTime();
  if (t < Date.parse(CAMPAIGN.startsAt)) return 'before';
  if (t > Date.parse(CAMPAIGN.endsAt)) return 'ended';
  return 'live';
}

/** Seats left, floored at zero. `sold` is a COUNT OF REAL PAID PURCHASES. */
export function seatsLeft(sold: number): number {
  return Math.max(0, CAMPAIGN.slots - Math.max(0, sold));
}

// ── Scarcity may only be shown when it is actually scarce ───────────────────
//
// Founder, 13 Aug, seeing the live Home card: "don't show 50/50 spots left —
// student will feel no one is buying."
//
// He is right, and this is the worst instance of it in the app. "9 students
// studied today" is a weak signal; "50 of 50 spots left" is a STRONG one
// pointing the wrong way — it is a precise, confident announcement that not a
// single person has bought, printed directly above the buy button. A student
// reads it as a verdict other people have already reached.
//
// A seat counter only does its job in one direction. "12 spots left" carries
// urgency AND implies 38 people decided this was worth ₹2,499. The same
// component with a full counter carries no urgency and implies the opposite.
// So the number appears only once enough seats are genuinely gone.
//
// Half, deliberately: at 50 slots the line appears at 25 left, which means 25
// real students have paid. That is a number worth showing on both counts.
//
// The fix is a threshold, never a fake figure. We do not inflate `sold`, we do
// not invent "only a few left", and we do not count anything but real paid
// purchases. When there is nothing true and helpful to say about seats, the
// card says nothing about seats and sells on the offer instead.
export function mayShowSeatsLeft(left: number, slots: number): boolean {
  if (slots <= 0) return false;
  return left <= Math.floor(slots / 2);
}

/** The saving, in whole rupees, for display. */
export function savingRupees(): number {
  return Math.round((PLANS[CAMPAIGN.plan].amountPaise - CAMPAIGN.offerPaise) / 100);
}

export interface CampaignState {
  /** Window open AND seats remain. The one flag every surface gates on. */
  live: boolean;
  phase: CampaignPhase;
  seatsLeft: number;
  slots: number;
  plan: PlanId;
  offerPaise: number;
  listPaise: number;
  offerDisplay: string;   // "₹2,499"
  listDisplay: string;    // "₹2,999"
  savingDisplay: string;  // "₹500"
  endsAt: string;
  label: string;
  headline: string;
}

const rupees = (paise: number) =>
  `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

/**
 * The campaign as every surface sees it.
 *
 * `live` is false the moment the window closes OR the 50th seat sells — so a
 * sold-out campaign disappears from Home, the offer page and the push copy
 * without anyone deploying anything.
 */
export function campaignState(now: Date, sold: number): CampaignState {
  const phase = campaignPhase(now);
  const left = seatsLeft(sold);
  return {
    live: phase === 'live' && left > 0,
    phase,
    seatsLeft: left,
    slots: CAMPAIGN.slots,
    plan: CAMPAIGN.plan,
    offerPaise: CAMPAIGN.offerPaise,
    listPaise: PLANS[CAMPAIGN.plan].amountPaise,
    offerDisplay: rupees(CAMPAIGN.offerPaise),
    listDisplay: rupees(PLANS[CAMPAIGN.plan].amountPaise),
    savingDisplay: rupees(PLANS[CAMPAIGN.plan].amountPaise - CAMPAIGN.offerPaise),
    endsAt: CAMPAIGN.endsAt,
    label: CAMPAIGN.label,
    headline: CAMPAIGN.headline,
  };
}

/**
 * Does the campaign price apply to THIS checkout?
 *
 * Deliberately narrow: the campaign plan only, inside the window, with seats
 * left, and only when it actually beats what the student already has. A
 * founder scholarship or a coupon that is cheaper always wins — the campaign
 * can lower a price, never raise one.
 */
export function campaignAppliesTo(
  planId: PlanId,
  currentFinalPaise: number,
  now: Date,
  sold: number,
): boolean {
  if (planId !== CAMPAIGN.plan) return false;
  if (!campaignState(now, sold).live) return false;
  return currentFinalPaise > CAMPAIGN.offerPaise;
}
