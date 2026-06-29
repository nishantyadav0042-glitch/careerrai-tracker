import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { paymentsEnabled } from '@/lib/feature-flags';
import { PLANS, isPlanId } from '@/lib/plans';
import { createRazorpayOrder } from '@/lib/razorpay';
import { resolvePrice, MIN_CHARGE_PAISE } from '@/lib/pricing';
import { grantPremiumAndQueueBuddy } from '@/lib/premium';

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
      const renews = new Date();
      renews.setMonth(renews.getMonth() + p.months);

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

      // Burn the coupon (per-student + global) when one made it free.
      if (price.couponId) {
        await admin.from('coupon_redemptions').insert({
          coupon_id: price.couponId, student_id: user.id, payment_id: payRow?.id ?? null,
        });
        await admin.rpc('increment_coupon_use', { p_coupon_id: price.couponId });
      }

      return NextResponse.json({ free: true });
    }

    // Return the existing pending order if one was created in the last 30 minutes.
    // Prevents duplicate Razorpay orders from double-clicks or multi-tab checkouts.
    const { data: pendingOrder } = await admin
      .from('student_payments')
      .select('razorpay_order_id, amount')
      .eq('student_id', user.id)
      .eq('plan', plan)
      .eq('status', 'created')
      .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
      .maybeSingle();

    if (pendingOrder?.razorpay_order_id) {
      return NextResponse.json({
        orderId:       pendingOrder.razorpay_order_id,
        amount:        pendingOrder.amount,
        currency:      'INR',
        keyId:         process.env.RAZORPAY_KEY_ID,
        plan,
        discountLabel: price.label,
      });
    }

    const order = await createRazorpayOrder(price.finalPaise, `careerrai_${user.id.slice(0, 8)}_${Date.now()}`);

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
    });
  } catch (e) {
    console.error('[create-order]', e);
    return NextResponse.json({ error: "Couldn't start checkout. Try again." }, { status: 500 });
  }
}
