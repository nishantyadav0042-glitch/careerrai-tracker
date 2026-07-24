import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyRazorpayWebhook } from '@/lib/razorpay';
import { PLANS, isPlanId, addMonthsClamped } from '@/lib/plans';
import { grantPremiumAndQueueBuddy, revokePremium } from '@/lib/premium';
import { logSecurityEvent } from '@/lib/security-log';
import { sendMetaCapiEvent } from '@/lib/meta-capi';

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
          .select('id, student_id, plan, status, coupon_code, amount')
          .eq('razorpay_order_id', orderId)
          .maybeSingle();

        if (row && row.status !== 'paid') {
          const months = isPlanId(row.plan) ? PLANS[row.plan].months : 1;
          const renews = addMonthsClamped(new Date(), months);

          // Single atomic DB transaction: marks payment paid, activates
          // subscription, and burns the coupon. If any step fails the webhook
          // returns 500 and Razorpay retries — the guard above re-checks status
          // so only the truly-failed ops run on retry.
          const { error: activateErr } = await admin.rpc('activate_payment', {
            p_payment_id:          row.id,
            p_student_id:          row.student_id,
            p_plan:                row.plan,
            p_renews_at:           renews.toISOString(),
            p_razorpay_payment_id: paymentId ?? null,
            p_coupon_code:         row.coupon_code ?? null,
          });

          if (activateErr) {
            console.error('[rzp-webhook] activate_payment failed:', activateErr.message);
            return NextResponse.json({ error: 'db error' }, { status: 500 });
          }

          // Freemium upgrade: flip is_premium, queue a buddy, confirm in-app.
          // Idempotent — safe on Razorpay retries (the status guard above stops
          // activate_payment re-running; these are no-ops the second time).
          await grantPremiumAndQueueBuddy(admin, row.student_id);

          // ROI attribution (founder, 24 Jul): "why did this student actually
          // buy?" — last-touch, computed from what really happened, not
          // guessed. Also resolves any pending 'convert_now' Brain decision
          // immediately (more precise than waiting for the reconcile cron —
          // we KNOW the exact purchase moment right here).
          void attributePurchaseAndResolveDecision(admin, row.student_id, orderId).catch((e) => console.error('[rzp-webhook] attribution failed', e));

          await logSecurityEvent(admin, {
            type: 'payment_activated', severity: 'info', userId: row.student_id,
            metadata: { plan: row.plan, orderId, paymentId, coupon: row.coupon_code ?? null },
          });

          // Server-side Purchase (Meta Conversions API), deduped with the browser
          // Pixel via eventId = orderId. Hashed email/phone improve ad matching.
          const { data: prof } = await admin.from('profiles').select('email, phone').eq('id', row.student_id).maybeSingle();
          await sendMetaCapiEvent({
            eventName: 'Purchase',
            eventId: orderId,
            value: (row.amount ?? 0) / 100,
            currency: 'INR',
            email: prof?.email,
            phone: prof?.phone,
          });
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

// Ranked by how directly each event indicates buying intent — the most recent
// one in the 14 days before purchase is the last touch. Real event names only
// (autocapture's `tap` carries `el`, so a buy-tap is matched by its data-analytics
// name rather than invented as a separate event type).
const TOUCH_RANK = ['buddy_plan_click', 'buddy_unlock_open', 'buddy_cta_click', 'push_click', 'daily_log', 'screen_view'];

async function attributePurchaseAndResolveDecision(
  admin: ReturnType<typeof createAdminClient>,
  studentId: string,
  orderId: string
): Promise<void> {
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const { data: events } = await admin
    .from('student_events').select('event, created_at, props')
    .eq('user_id', studentId).gte('created_at', since)
    .in('event', TOUCH_RANK).order('created_at', { ascending: false }).limit(1);

  const lastTouch = events?.[0]?.event ?? 'organic';
  await admin.from('student_events').insert({
    user_id: studentId, event: 'purchase_attributed',
    props: { last_touch: lastTouch, order_id: orderId },
    path: null,
  });

  // Resolve any pending Brain 'convert_now' decision for this student RIGHT
  // NOW — we know the exact outcome, no need to wait for the reconcile cron.
  await admin.from('decision_log')
    .update({ outcome: 'purchased', business_impact: 'positive', executed: true, outcome_at: new Date().toISOString() })
    .eq('student_id', studentId).eq('action_id', 'convert_now').is('outcome', null);
}
