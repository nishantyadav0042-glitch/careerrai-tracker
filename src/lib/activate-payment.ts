import { createAdminClient } from '@/lib/supabase/admin';
import { PLANS, isPlanId, addMonthsClamped } from '@/lib/plans';
import { grantPremiumAndQueueBuddy } from '@/lib/premium';
import { logSecurityEvent } from '@/lib/security-log';
import { emitTimeline } from '@/lib/os/timeline';
import { sendMetaCapiEvent } from '@/lib/meta-capi';

// The ONE path that turns a real Razorpay capture into a paid, premium student.
// Shared by the webhook (normal case) and the reconcile-payments cron (the
// safety net for when a webhook never arrives). Keeping it in one place means a
// fix to how we activate can never apply to only half the ways money arrives.

export interface PayableRow {
  id: string;
  student_id: string;
  plan: string;
  coupon_code?: string | null;
  amount?: number | null;
}

export type ActivationSource = 'webhook' | 'reconcile';

/**
 * Idempotent: callers must only pass a row whose status is not already 'paid',
 * and `activate_payment` itself is safe to retry. Returns false if the DB
 * transaction failed — the caller should surface that (webhook 500 → Razorpay
 * retries; cron → logged and retried next run).
 */
export async function activatePaidOrder(
  admin: ReturnType<typeof createAdminClient>,
  row: PayableRow,
  orderId: string,
  paymentId: string | null,
  source: ActivationSource,
): Promise<boolean> {
  const months = isPlanId(row.plan) ? PLANS[row.plan].months : 1;
  const renews = addMonthsClamped(new Date(), months);

  const { error: activateErr } = await admin.rpc('activate_payment', {
    p_payment_id:          row.id,
    p_student_id:          row.student_id,
    p_plan:                row.plan,
    p_renews_at:           renews.toISOString(),
    p_razorpay_payment_id: paymentId ?? null,
    p_coupon_code:         row.coupon_code ?? null,
  });
  if (activateErr) {
    console.error(`[activate:${source}] activate_payment failed:`, activateErr.message);
    return false;
  }

  // Freemium upgrade: flip is_premium, queue a buddy, confirm in-app.
  await grantPremiumAndQueueBuddy(admin, row.student_id);

  void attributePurchaseAndResolveDecision(admin, row.student_id, orderId)
    .catch((e) => console.error(`[activate:${source}] attribution failed`, e));

  await logSecurityEvent(admin, {
    type: 'payment_activated', severity: 'info', userId: row.student_id,
    metadata: { plan: row.plan, orderId, paymentId, coupon: row.coupon_code ?? null, source },
  });

  // Timeline: the single most important decision in a student's story.
  await emitTimeline(admin, {
    entity: 'student', entityId: row.student_id, kind: 'subscribed',
    summary: `Subscribed — ₹${(row.amount ?? 0) / 100}, ${row.plan}`,
    actor: 'student', metadata: { orderId, plan: row.plan },
  });

  const { data: prof } = await admin.from('profiles').select('email, phone').eq('id', row.student_id).maybeSingle();
  await sendMetaCapiEvent({
    eventName: 'Purchase',
    eventId: orderId,
    value: (row.amount ?? 0) / 100,
    currency: 'INR',
    email: prof?.email,
    phone: prof?.phone,
  });

  return true;
}

// Ranked by how directly each event indicates buying intent — the most recent
// one in the 14 days before purchase is the last touch.
const TOUCH_RANK = ['buddy_plan_click', 'buddy_unlock_open', 'buddy_cta_click', 'push_click', 'daily_log', 'screen_view'];

export async function attributePurchaseAndResolveDecision(
  admin: ReturnType<typeof createAdminClient>,
  studentId: string,
  orderId: string,
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

  // Resolve any pending Brain 'convert_now' decision RIGHT NOW — we know the
  // exact outcome, no need to wait for the reconcile-decisions cron.
  await admin.from('decision_log')
    .update({ outcome: 'purchased', business_impact: 'positive', executed: true, outcome_at: new Date().toISOString() })
    .eq('student_id', studentId).eq('action_id', 'convert_now').is('outcome', null);
}
