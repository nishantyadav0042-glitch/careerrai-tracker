import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { paymentsEnabled } from '@/lib/feature-flags';
import { PLANS, isPlanId, addMonthsClamped } from '@/lib/plans';
import { createRazorpayOrder } from '@/lib/razorpay';
import { resolvePrice, MIN_CHARGE_PAISE } from '@/lib/pricing';
import { grantPremiumAndQueueBuddy } from '@/lib/premium';
import { normalizeIndianPhone } from '@/lib/phone';

export async function POST(request: NextRequest) {
  if (!paymentsEnabled()) return NextResponse.json({ error: 'Payments are not enabled.' }, { status: 403 });
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { plan, coupon } = (await request.json()) as { plan?: string; coupon?: string };
    if (!plan || !isPlanId(plan)) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    const p = PLANS[plan];

    // Authoritative price: scholarship (founder grant) beats coupon; both verified server-side.
    const price = await resolvePrice(user.id, plan, coupon);
    if (price.error) return NextResponse.json({ error: price.error }, { status: 400 });

    const admin = createAdminClient();

    // Free path: a grant brought the price below Razorpay's floor — activate directly.
    if (price.finalPaise < MIN_CHARGE_PAISE) {
      const renews = addMonthsClamped(new Date(), p.months);

      const { data: payRow } = await admin.from('student_payments').insert({
        student_id: user.id,
        amount: price.finalPaise,
        original_amount: price.basePaise,
        plan,
        discount_source: price.discountSource,
        coupon_code: price.couponCode,
        status: 'paid',
        paid_at: new Date().toISOString(),
      }).select('id').single();

      await admin.from('profiles').update({
        subscription_status: 'active',
        subscription_plan: plan,
        subscription_renews_at: renews.toISOString(),
      }).eq('id', user.id);

      // Freemium: a free (scholarship/coupon) activation still unlocks the buddy.
      await grantPremiumAndQueueBuddy(admin, user.id);

      // Burn the coupon (per-student + global) when one made it free. Upsert so a
      // repeat free-activation for the same (coupon, student) is a no-op under the
      // coupon_redemptions unique constraint, and bump used_count ONLY when a new
      // redemption row actually landed — never double-count.
      if (price.couponId) {
        const { data: redeemed } = await admin
          .from('coupon_redemptions')
          .upsert(
            { coupon_id: price.couponId, student_id: user.id, payment_id: payRow?.id ?? null },
            { onConflict: 'coupon_id,student_id', ignoreDuplicates: true }
          )
          .select('id');
        if (redeemed && redeemed.length > 0) {
          // increment_coupon_use is conditional on max_uses (TOCTOU fix,
          // security audit 14 July) — false means the cap was already hit
          // by a concurrent redemption; undo this student's row so they
          // aren't left with a "used" coupon that never actually counted.
          const { data: claimed } = await admin.rpc('increment_coupon_use', { p_coupon_id: price.couponId });
          if (!claimed) {
            await admin.from('coupon_redemptions').delete().eq('coupon_id', price.couponId).eq('student_id', user.id);
          }
        }
      }

      return NextResponse.json({ free: true });
    }

    // Contact details for Razorpay's prefill, read SERVER-SIDE from the profile.
    //
    // Without these, Razorpay's first screen asks a signed-in student for their
    // phone number and email again — details we already hold and already
    // verified at signup. It reads as "why is this asking me this?" on the one
    // screen where hesitation costs the sale, and every extra field on a mobile
    // checkout is a place to drop out.
    //
    // Resolved here rather than passed from the client because every surface
    // (buddy paywall, membership card) needs the same values, and a prop
    // threaded through four components is a place for them to drift — the
    // failure this codebase keeps paying for. One authoritative source.
    const { data: payer } = await admin
      .from('profiles')
      .select('full_name, phone, email')
      .eq('id', user.id)
      .maybeSingle();

    // normalizeIndianPhone, NOT a regex written here. profiles.phone is not
    // guaranteed canonical — the same number appears stored as +91XXXXXXXXXX,
    // 91XXXXXXXXXX and bare XXXXXXXXXX (see phoneVariants, which exists because
    // an inbound webhook kept missing matches for exactly that reason). A local
    // check that only understood one of those shapes would hand Razorpay a
    // malformed contact, which it IGNORES SILENTLY — leaving the student asked
    // for their number again and no error anywhere to say why.
    const contact = normalizeIndianPhone(payer?.phone) ?? undefined;
    const prefill = {
      name: payer?.full_name || undefined,
      contact,
      email: payer?.email || undefined,
    };

    // Return the existing pending order if one was created in the last 30 minutes
    // AND for the SAME final price. Prevents duplicate Razorpay orders from
    // double-clicks or multi-tab checkouts, while closing a real billing bug
    // (audit, 14 July): the old reuse check ignored amount entirely, so a
    // student who applied/changed a coupon after opening checkout once would
    // get the STALE order's amount back with the NEW discountLabel shown on
    // screen — charging full price while the UI promised a discount (or the
    // reverse, undercharging). A price mismatch now falls through to mint a
    // fresh order instead of silently reusing the wrong one.
    const { data: pendingOrder } = await admin
      .from('student_payments')
      .select('razorpay_order_id, amount')
      .eq('student_id', user.id)
      .eq('plan', plan)
      .eq('status', 'created')
      .eq('amount', price.finalPaise)
      .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pendingOrder?.razorpay_order_id) {
      return NextResponse.json({
        orderId:       pendingOrder.razorpay_order_id,
        amount:        pendingOrder.amount,
        currency:      'INR',
        keyId:         process.env.RAZORPAY_KEY_ID,
        plan,
        discountLabel: price.label,
        prefill,
      });
    }

    // notes document the true nature of the charge on the order/receipt: a 1:1,
    // person-to-person mentorship service (live sessions + daily guidance), which
    // is exempt from mandatory app-store billing. Not framed as "digital content".
    const order = await createRazorpayOrder(
      price.finalPaise,
      `careerrai_${user.id.slice(0, 8)}_${Date.now()}`,
      {
        service: '1:1 CAT mentorship',
        plan: p.label,
        description: `${p.label} of 1:1 mentorship with an IIM mentor — live weekly sessions & daily guidance`,
      },
    );

    // Record the intent; the webhook flips it to 'paid' after signature verify.
    await admin.from('student_payments').insert({
      student_id: user.id,
      amount: price.finalPaise,
      original_amount: price.basePaise,
      plan,
      discount_source: price.discountSource,
      coupon_code: price.couponCode,
      razorpay_order_id: order.id,
      status: 'created',
    });

    return NextResponse.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID, // public key id — safe on the client
      plan,
      discountLabel: price.label,
      prefill,
    });
  } catch (e) {
    console.error('[create-order]', e);
    return NextResponse.json({ error: "Couldn't start checkout. Try again." }, { status: 500 });
  }
}
