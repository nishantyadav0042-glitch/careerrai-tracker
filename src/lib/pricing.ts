import { createAdminClient } from '@/lib/supabase/admin';
import { PLANS, type PlanId } from '@/lib/plans';

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
  if (c.discount_type === 'percent') return Math.round(basePaise * (100 - c.discount_value) / 100);
  return Math.max(0, basePaise - c.discount_value);
}

export interface PriceResult {
  basePaise: number;
  finalPaise: number;
  discountSource: 'scholarship' | 'coupon' | null;
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

// Authoritative price resolution for a checkout. Scholarship (founder hardship
// grant) takes precedence over any coupon — we never stack them.
export async function resolvePrice(
  studentId: string,
  planId: PlanId,
  couponCodeInput?: string | null,
): Promise<PriceResult> {
  const basePaise = PLANS[planId].amountPaise;
  const admin = createAdminClient();

  const scholarship = await getActiveScholarship(studentId);
  if (scholarship) {
    return {
      basePaise,
      finalPaise: priceWithScholarship(basePaise, scholarship),
      discountSource: 'scholarship',
      label: 'Founder scholarship',
      couponId: null,
      couponCode: null,
    };
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

    return {
      basePaise,
      finalPaise: priceWithCoupon(basePaise, coupon as ActiveCoupon),
      discountSource: 'coupon',
      label: coupon.code,
      couponId: coupon.id,
      couponCode: coupon.code,
    };
  }

  return { basePaise, finalPaise: basePaise, discountSource: null, label: null, couponId: null, couponCode: null };
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
