import { createAdminClient } from '@/lib/supabase/admin';
import { PLANS, type PlanId } from '@/lib/plans';
import { CAMPAIGN, campaignAppliesTo } from '@/lib/campaign';

// Razorpay won't create an order below ₹1. At or below this we treat the
// purchase as effectively free and activate without a payment round-trip.
export const MIN_CHARGE_PAISE = 100;

export interface ActiveScholarship {
  id: string;
  discount_percent: number | null;
  final_price_paise: number | null;
}

export interface ActiveCoupon {
  id: string;
  code: string;
  discount_type: 'percent' | 'flat';
  discount_value: number; // percent 1-100, or flat paise
  max_uses: number | null;
  used_count: number;
}

// Pure: what a scholarship charges for a given list price.
export function priceWithScholarship(basePaise: number, s: ActiveScholarship): number {
  if (s.final_price_paise != null) return Math.min(s.final_price_paise, basePaise);
  if (s.discount_percent != null) return Math.round(basePaise * (100 - s.discount_percent) / 100);
  return basePaise;
}

// Pure: what a coupon charges for a given list price. Never below zero.
export function priceWithCoupon(basePaise: number, c: ActiveCoupon): number {
  // Both branches clamp at zero. The flat branch always did; the percent branch
  // did not, so a coupon row with discount_value > 100 produced a NEGATIVE
  // price and handed it to order creation. Not reachable through the admin
  // route today (it enforces 1–100), but nothing at the database or function
  // level enforced it, and this function is what money is computed from.
  if (c.discount_type === 'percent') {
    return Math.max(0, Math.round(basePaise * (100 - c.discount_value) / 100));
  }
  return Math.max(0, basePaise - c.discount_value);
}

export interface PriceResult {
  basePaise: number;
  finalPaise: number;
  discountSource: 'scholarship' | 'coupon' | 'campaign' | null;
  label: string | null;        // human note e.g. "Founder scholarship" / "WELCOME20"
  couponId: string | null;
  couponCode: string | null;
  error?: string;              // set when a supplied coupon is invalid
}

// Fetch the student's currently-effective scholarship (active + not expired).
export async function getActiveScholarship(studentId: string): Promise<ActiveScholarship | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('scholarships')
    .select('id, discount_percent, final_price_paise, expires_at')
    .eq('student_id', studentId)
    .eq('status', 'active')
    .maybeSingle();
  if (!data) return null;
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return null;
  return { id: data.id, discount_percent: data.discount_percent, final_price_paise: data.final_price_paise };
}

/**
 * Seats already sold on the campaign — counted from REAL PAID PURCHASES.
 *
 * Scale Contract §4: the number on the page must drill down to the exact rows
 * behind it. This counts student_payments rows that are `paid`, on the
 * campaign plan, inside the campaign window — the same rows the founder can
 * open in the payments workspace. Never a cached integer, never a guess.
 */
export async function campaignSeatsSold(): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin
    .from('student_payments')
    .select('id', { count: 'exact', head: true })
    .eq('plan', CAMPAIGN.plan)
    .eq('status', 'paid')
    .gte('paid_at', CAMPAIGN.startsAt)
    .lte('paid_at', CAMPAIGN.endsAt);
  return count ?? 0;
}

// Authoritative price resolution for a checkout. Scholarship (founder hardship
// grant) takes precedence over any coupon — we never stack them.
export async function resolvePrice(
  studentId: string,
  planId: PlanId,
  couponCodeInput?: string | null,
): Promise<PriceResult> {
  const basePaise = PLANS[planId].amountPaise;
  const admin = createAdminClient();

  // ── The campaign, applied LAST and only if it helps ────────────────────────
  //
  // Every return path below funnels through withCampaign(). The offer can only
  // ever LOWER a price: a founder scholarship or a cheaper coupon still wins.
  // The 50-seat cap is enforced HERE, on the money path — not merely displayed
  // — so the 51st checkout is charged list price even if a stale page promised
  // otherwise. An invalid-coupon error is passed through untouched.
  const soldPromise = campaignSeatsSold();
  const withCampaign = async (r: PriceResult): Promise<PriceResult> => {
    if (r.error) return r;
    const sold = await soldPromise;
    if (!campaignAppliesTo(planId, r.finalPaise, new Date(), sold)) return r;
    return {
      ...r,
      finalPaise: CAMPAIGN.offerPaise,
      discountSource: 'campaign',
      label: CAMPAIGN.label,
    };
  };

  const scholarship = await getActiveScholarship(studentId);
  if (scholarship) {
    return withCampaign({
      basePaise,
      finalPaise: priceWithScholarship(basePaise, scholarship),
      discountSource: 'scholarship',
      label: 'Founder scholarship',
      couponId: null,
      couponCode: null,
    });
  }

  const code = couponCodeInput?.trim().toUpperCase();
  if (code) {
    const { data: coupon } = await admin
      .from('coupons')
      .select('id, code, discount_type, discount_value, max_uses, used_count, status, expires_at')
      .eq('code', code)
      .maybeSingle();

    const invalid = (msg: string): PriceResult => ({
      basePaise, finalPaise: basePaise, discountSource: null, label: null, couponId: null, couponCode: null, error: msg,
    });

    if (!coupon || coupon.status !== 'active') return invalid("That coupon isn't valid.");
    if (coupon.expires_at && new Date(coupon.expires_at).getTime() < Date.now()) return invalid('That coupon has expired.');
    if (coupon.max_uses != null && coupon.used_count >= coupon.max_uses) return invalid('That coupon has been fully used.');

    // Per-student limit of 1.
    const { data: already } = await admin
      .from('coupon_redemptions')
      .select('id')
      .eq('coupon_id', coupon.id)
      .eq('student_id', studentId)
      .maybeSingle();
    if (already) return invalid("You've already used that coupon.");

    return withCampaign({
      basePaise,
      finalPaise: priceWithCoupon(basePaise, coupon as ActiveCoupon),
      discountSource: 'coupon',
      label: coupon.code,
      couponId: coupon.id,
      couponCode: coupon.code,
    });
  }

  return withCampaign({ basePaise, finalPaise: basePaise, discountSource: null, label: null, couponId: null, couponCode: null });
}

// Display helper: per-plan price strings after a scholarship, for the membership card.
export function scholarshipDisplay(s: ActiveScholarship): Record<PlanId, string> {
  const out = {} as Record<PlanId, string>;
  (Object.keys(PLANS) as PlanId[]).forEach((id) => {
    const p = priceWithScholarship(PLANS[id].amountPaise, s);
    out[id] = `₹${(p / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  });
  return out;
}
