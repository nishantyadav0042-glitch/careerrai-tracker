import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyRazorpayWebhook } from '@/lib/razorpay';
import { PLANS, isPlanId } from '@/lib/plans';

// Subscription state changes ONLY here, and only after the signature verifies.
// Client-side "payment success" callbacks are never trusted.
export async function POST(request: NextRequest) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[rzp-webhook] RAZORPAY_WEBHOOK_SECRET not set');
    return NextResponse.json({ error: 'not configured' }, { status: 500 });
  }

  const raw = await request.text();
  const signature = request.headers.get('x-razorpay-signature');
  if (!verifyRazorpayWebhook(raw, signature, secret)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  try {
    const event = JSON.parse(raw) as {
      event: string;
      payload?: { payment?: { entity?: { id?: string; order_id?: string } } };
    };

    if (event.event === 'payment.captured' || event.event === 'order.paid') {
      const entity = event.payload?.payment?.entity;
      const orderId = entity?.order_id;
      const paymentId = entity?.id;

      if (orderId) {
        const admin = createAdminClient();
        const { data: row } = await admin
          .from('student_payments')
          .select('id, student_id, plan, status')
          .eq('razorpay_order_id', orderId)
          .maybeSingle();

        if (row && row.status !== 'paid') {
          await admin
            .from('student_payments')
            .update({ status: 'paid', paid_at: new Date().toISOString(), razorpay_payment_id: paymentId ?? null })
            .eq('id', row.id);

          const months = isPlanId(row.plan) ? PLANS[row.plan].months : 1;
          const renews = new Date();
          renews.setMonth(renews.getMonth() + months);

          await admin
            .from('profiles')
            .update({
              subscription_status: 'active',
              subscription_plan: row.plan,
              subscription_renews_at: renews.toISOString(),
            })
            .eq('id', row.student_id);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[rzp-webhook]', e);
    return NextResponse.json({ error: 'error' }, { status: 500 });
  }
}
