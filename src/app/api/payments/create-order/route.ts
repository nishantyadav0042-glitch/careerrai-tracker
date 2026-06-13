import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { paymentsEnabled } from '@/lib/feature-flags';
import { PLANS, isPlanId } from '@/lib/plans';
import { createRazorpayOrder } from '@/lib/razorpay';

export async function POST(request: NextRequest) {
  if (!paymentsEnabled()) return NextResponse.json({ error: 'Payments are not enabled.' }, { status: 403 });
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { plan } = (await request.json()) as { plan?: string };
    if (!plan || !isPlanId(plan)) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    const p = PLANS[plan];

    const order = await createRazorpayOrder(p.amountPaise, `careerrai_${user.id.slice(0, 8)}_${Date.now()}`);

    // Record the intent; the webhook flips it to 'paid' after signature verify.
    const admin = createAdminClient();
    await admin.from('student_payments').insert({
      student_id: user.id,
      amount: p.amountPaise,
      plan,
      razorpay_order_id: order.id,
      status: 'created',
    });

    return NextResponse.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID, // public key id — safe on the client
      plan,
    });
  } catch (e) {
    console.error('[create-order]', e);
    return NextResponse.json({ error: "Couldn't start checkout. Try again." }, { status: 500 });
  }
}
