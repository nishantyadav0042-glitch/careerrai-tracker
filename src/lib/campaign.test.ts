import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CAMPAIGN, campaignPhase, campaignState, seatsLeft, savingRupees, campaignAppliesTo,
} from './campaign';
import { PLANS } from './plans';

// ── The Independence Day campaign, pinned ───────────────────────────────────
//
// Founder, 12 Aug: "first we have only 50 slots available..don't calculate
// anything yourself as Ik". 50 is HIS number. These tests exist so nothing —
// no later refactor, no clever capacity derivation — can quietly sell a 51st
// seat or charge a price the page did not promise.

const IST = (iso: string) => new Date(iso);
const BEFORE = IST('2026-08-12T10:00:00Z'); // 12 Aug 15:30 IST
const DURING = IST('2026-08-15T06:00:00Z'); // 15 Aug 11:30 IST — Independence Day
const AFTER  = IST('2026-08-16T02:00:00Z'); // 16 Aug 07:30 IST

describe('the offer is what the founder approved', () => {
  it('₹2,499 on the TILL-CAT plan — not the 3-month plan', () => {
    // The 3-month plan would end 15 Nov, fourteen days BEFORE CAT (29 Nov),
    // taking the mentor away during the final mock fortnight. Till-CAT covers
    // exam day, which is the whole promise.
    expect(CAMPAIGN.plan).toBe('tillcat');
    expect(CAMPAIGN.offerPaise).toBe(249900);
    expect(PLANS.tillcat.amountPaise).toBe(299900);
    expect(savingRupees()).toBe(500);
  });

  it('capacity is exactly 50 — the founder\'s number, never derived', () => {
    expect(CAMPAIGN.slots).toBe(50);
  });
});

describe('the window opens and closes itself', () => {
  it('is not live before 13 Aug', () => {
    expect(campaignPhase(BEFORE)).toBe('before');
    expect(campaignState(BEFORE, 0).live).toBe(false);
  });

  it('is live on Independence Day', () => {
    expect(campaignPhase(DURING)).toBe('live');
    expect(campaignState(DURING, 0).live).toBe(true);
  });

  it('ends by itself after 15 Aug — no deploy needed', () => {
    expect(campaignPhase(AFTER)).toBe('ended');
    expect(campaignState(AFTER, 0).live).toBe(false);
  });
});

describe('the 50th seat is the last one', () => {
  it('counts down honestly', () => {
    expect(seatsLeft(0)).toBe(50);
    expect(seatsLeft(37)).toBe(13);
    expect(seatsLeft(49)).toBe(1);
  });

  it('goes dark at 50 — even mid-window', () => {
    const s = campaignState(DURING, 50);
    expect(s.seatsLeft).toBe(0);
    expect(s.live).toBe(false);
  });

  it('never goes negative, even if two payments race past the cap', () => {
    expect(seatsLeft(53)).toBe(0);
    expect(campaignState(DURING, 53).live).toBe(false);
  });
});

describe('the money rule: the campaign can only ever LOWER a price', () => {
  const list = PLANS.tillcat.amountPaise;

  it('applies to a full-price Till-CAT checkout while live', () => {
    expect(campaignAppliesTo('tillcat', list, DURING, 0)).toBe(true);
  });

  it('does NOT apply to other plans', () => {
    expect(campaignAppliesTo('quarterly', PLANS.quarterly.amountPaise, DURING, 0)).toBe(false);
    expect(campaignAppliesTo('monthly', PLANS.monthly.amountPaise, DURING, 0)).toBe(false);
    expect(campaignAppliesTo('halfyear', PLANS.halfyear.amountPaise, DURING, 0)).toBe(false);
  });

  it('never overrides a CHEAPER scholarship or coupon', () => {
    // A founder hardship grant at ₹999 must survive the campaign untouched.
    expect(campaignAppliesTo('tillcat', 99900, DURING, 0)).toBe(false);
    // Equal price: nothing to improve, leave the existing label alone.
    expect(campaignAppliesTo('tillcat', CAMPAIGN.offerPaise, DURING, 0)).toBe(false);
  });

  it('stops applying the moment the 50th seat sells — the 51st pays list', () => {
    expect(campaignAppliesTo('tillcat', list, DURING, 49)).toBe(true);
    expect(campaignAppliesTo('tillcat', list, DURING, 50)).toBe(false);
  });

  it('stops applying outside the window', () => {
    expect(campaignAppliesTo('tillcat', list, BEFORE, 0)).toBe(false);
    expect(campaignAppliesTo('tillcat', list, AFTER, 0)).toBe(false);
  });
});

describe('the price a student is SHOWN is the price the server charges', () => {
  it('display strings come from the same paise the checkout uses', () => {
    const s = campaignState(DURING, 0);
    expect(s.offerDisplay).toBe('₹2,499');
    expect(s.listDisplay).toBe('₹2,999');
    expect(s.savingDisplay).toBe('₹500');
    expect(s.offerPaise).toBe(CAMPAIGN.offerPaise);
  });

  it('the seat cap is enforced on the MONEY PATH, not just the UI', () => {
    // resolvePrice is what create-order charges from. If the campaign were
    // only applied in a component, a stale page could promise ₹2,499 while
    // Razorpay charged ₹2,999 — or worse, the reverse, past 50 seats.
    const pricing = readFileSync('src/lib/pricing.ts', 'utf8');
    expect(pricing).toContain('campaignAppliesTo');
    expect(pricing).toContain('campaignSeatsSold');
  });

  it('seats sold are counted from REAL PAID ROWS (drill-down, Scale Contract)', () => {
    const pricing = readFileSync('src/lib/pricing.ts', 'utf8');
    expect(pricing).toContain("from('student_payments')");
    expect(pricing).toContain("eq('status', 'paid')");
  });
});
