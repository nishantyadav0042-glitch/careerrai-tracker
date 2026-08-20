import { createAdminClient } from '@/lib/supabase/admin';
import { PLANS, isPlanId, addMonthsClamped } from '@/lib/plans';
import { grantPremiumAndQueueBuddy } from '@/lib/premium';
import { logSecurityEvent } from '@/lib/security-log';
import { emitTimeline } from '@/lib/os/timeline';
import { sendMetaCapiEvent } from '@/lib/meta-capi';
import { SESSION_PLAN_ID, SESSION_PRICE_PAISE } from '@/lib/session-credit';

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
  /** Session purchases only: the diagnostic finding that motivated the buy,
   *  carried onto the credit so the mentor opens knowing the problem. */
  finding_kind?: string | null;
  finding_evidence?: string | null;
  /** Plan purchases only: the ₹299 session credit applied at order creation. */
  session_credit_id?: string | null;
}

export type ActivationSource = 'webhook' | 'reconcile';

/**
 * Idempotent: callers must only pass a row whose status is not already 'paid',
 * and `activate_payment` itself is safe to retry. Returns false if the DB
 * transaction failed — the caller should surface that (webhook 500 → Razorpay
 * retries; cron → logged and retried next run).
 */
/**
 * A paid ₹299 session: mark the payment, mint ONE credit, and put it in the
 * assignment queue. Deliberately does NOT grant premium.
 *
 * The credit carries the finding that motivated the purchase, so the mentor
 * opens the session already knowing the problem — and so we can eventually
 * answer the only question that matters: which findings convert, and which
 * interventions actually help.
 */
async function activateSessionCredit(
  admin: ReturnType<typeof createAdminClient>,
  row: PayableRow,
  orderId: string,
  paymentId: string | null,
  source: ActivationSource,
): Promise<boolean> {
  // Idempotent by the same guard the caller uses (status !== 'paid'), plus
  // this: a second webhook delivery must never mint a second credit.
  const { data: existing } = await admin
    .from('session_credits').select('id').eq('payment_id', row.id).maybeSingle();

  const { error: payErr } = await admin
    .from('student_payments')
    .update({ status: 'paid', razorpay_payment_id: paymentId ?? null })
    .eq('id', row.id);
  if (payErr) {
    console.error(`[activate:${source}] session payment update failed:`, payErr.message);
    return false;
  }

  if (!existing) {
    const { error: creditErr } = await admin.from('session_credits').insert({
      student_id: row.student_id,
      payment_id: row.id,
      status: 'paid',
      amount_paise: row.amount ?? SESSION_PRICE_PAISE,
      finding_kind: row.finding_kind ?? null,
      finding_evidence: row.finding_evidence ?? null,
    });
    if (creditErr) {
      // The money arrived and the entitlement did not — the one failure here
      // that must be loud, because the student has paid for nothing.
      console.error(`[activate:${source}] SESSION CREDIT MINT FAILED`, creditErr.message);
      return false;
    }
  }

  await logSecurityEvent(admin, {
    type: 'payment_activated', severity: 'info', userId: row.student_id,
    metadata: { plan: row.plan, orderId, paymentId, source, kind: 'session_credit' },
  });

  await emitTimeline(admin, {
    entity: 'student', entityId: row.student_id, kind: 'subscribed',
    summary: `Booked a 1:1 session — ₹${(row.amount ?? SESSION_PRICE_PAISE) / 100}`,
    actor: 'student', metadata: { orderId, plan: row.plan, finding: row.finding_kind ?? null },
  });

  return true;
}

export async function activatePaidOrder(
  admin: ReturnType<typeof createAdminClient>,
  row: PayableRow,
  orderId: string,
  paymentId: string | null,
  source: ActivationSource,
): Promise<boolean> {
  // ── The ₹299 session takes a DIFFERENT road ──────────────────────────────
  //
  // Every other plan here is a subscription: it flips is_premium and assigns a
  // permanent buddy. A session must do neither — the student stays free, and
  // the Buddy plan stays the thing they upgrade TO. Before session_credits
  // existed there was no way to express that, so selling one session would
  // have meant giving away the whole membership.
  if (row.plan === SESSION_PLAN_ID) {
    return activateSessionCredit(admin, row, orderId, paymentId, source);
  }

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

  // The ₹299 entry ladder: the payment is real, so the credit that
  // discounted it is now spent. IS NULL guard — one credit can never
  // discount two payments, even under webhook retries.
  if (row.session_credit_id) {
    await admin.from('session_credits')
      .update({ credited_to_payment_id: row.id })
      .eq('id', row.session_credit_id)
      .is('credited_to_payment_id', null);
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
