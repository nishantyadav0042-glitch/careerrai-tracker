import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyRazorpayWebhook } from '@/lib/razorpay';
import { revokePremium } from '@/lib/premium';
import { logSecurityEvent } from '@/lib/security-log';
import { activatePaidOrder } from '@/lib/activate-payment';
import { emitTimeline } from '@/lib/os/timeline';

// Subscription state changes ONLY here, and only after the signature verifies.
// Client-side "payment success" callbacks are never trusted.
export async function POST(request: NextRequest) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    // Return 200 so Razorpay stops retrying — this is a config error, not transient.
    // Alert must be fixed in Vercel env; retrying will never help.
    console.error('[rzp-webhook] RAZORPAY_WEBHOOK_SECRET not configured — event dropped');
    return NextResponse.json({ ok: true, warning: 'not configured' }, { status: 200 });
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
          .select('id, student_id, plan, status, coupon_code, amount, session_credit_id')
          .eq('razorpay_order_id', orderId)
          .maybeSingle();

        if (row && row.status !== 'paid') {
          // Marks paid, activates the subscription, burns the coupon, grants
          // premium + queues the buddy. On failure we return 500 so Razorpay
          // retries — the status guard above means only the failed ops re-run.
          const ok = await activatePaidOrder(admin, row, orderId, paymentId ?? null, 'webhook');
          if (!ok) return NextResponse.json({ error: 'db error' }, { status: 500 });
        }
      }
    }

    // Refund → downgrade to free (keep the account + all their logs).
    if (event.event === 'refund.processed' || event.event === 'refund.created') {
      const refundEntity = (event as { payload?: { refund?: { entity?: { payment_id?: string } } } })
        .payload?.refund?.entity;
      const refundedPaymentId = refundEntity?.payment_id;
      if (refundedPaymentId) {
        const admin = createAdminClient();
        const { data: row } = await admin
          .from('student_payments')
          .select('student_id')
          .eq('razorpay_payment_id', refundedPaymentId)
          .maybeSingle();
        if (row?.student_id) {
          await revokePremium(admin, row.student_id);
          await emitTimeline(admin, {
            entity: 'student', entityId: row.student_id, kind: 'refunded',
            summary: 'Refunded — premium revoked', actor: 'system',
            metadata: { paymentId: refundedPaymentId },
          });
          await logSecurityEvent(admin, {
            type: 'payment_refunded', severity: 'warning', userId: row.student_id,
            metadata: { paymentId: refundedPaymentId },
          });
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[rzp-webhook]', e);
    return NextResponse.json({ error: 'error' }, { status: 500 });
  }
}
