import { recordConversion, markConversionRefunded } from '@/lib/sales-earnings';
import { createAdminClient } from '@/lib/supabase/admin';
import { PLANS, isPlanId, addMonthsClamped } from '@/lib/plans';
import { grantPremiumAndQueueBuddy } from '@/lib/premium';
import { logSecurityEvent } from '@/lib/security-log';
import { emitTimeline } from '@/lib/os/timeline';
import { sendMetaCapiEvent } from '@/lib/meta-capi';
import { SESSION_PLAN_ID, SESSION_PRICE_PAISE } from '@/lib/session-credit';
import { MENTOR_FREE_MESSAGES } from '@/lib/mentor-doors';
import { assignBuddyToCredit } from '@/lib/session-assignment';
import { dispatch } from '@/lib/notification-os';

// The ONE path that turns a real Razorpay capture into a paid, premium student.
// Shared by the webhook (normal case) and the reconcile-payments cron (the
// safety net for when a webhook never arrives). Keeping it in one place means a
// fix to how we activate can never apply to only half the ways money arrives.

export interface PayableRow {
  id: string;
  student_id: string;
  plan: string;
  /**
   * OPTIONAL on purpose. The webhook and the checkout callback both select it
   * and it decides whether activation may proceed (see mayActivatePayment);
   * reconcile-payments filters `.eq('status','created')` in the query and does
   * not select the column, so absent here means 'created' rather than unknown.
   */
  status?: string | null;
  coupon_code?: string | null;
  amount?: number | null;
  /** Session purchases only: the diagnostic finding that motivated the buy,
   *  carried onto the credit so the mentor opens knowing the problem. */
  finding_kind?: string | null;
  finding_evidence?: string | null;
  /** What the STUDENT said they wanted, chosen at booking. */
  session_intent?: string | null;
  session_intent_note?: string | null;
  /** Plan purchases only: the session credit applied at order creation. */
  session_credit_id?: string | null;
}

export type ActivationSource = 'webhook' | 'reconcile';

/** The ledger row as the webhook needs it: the payable fields plus the status
 *  that decides idempotency (already 'paid' → the duplicate-delivery ACK). */
export interface WebhookPaymentRow extends PayableRow {
  status: string;
}

/**
 * Read the ledger row for a captured order — null ONLY when the query
 * succeeded and no row exists — or THROW.
 *
 * BOUNDARY 2, change 4 (founder GO, 21 Aug). The webhook used to destructure
 * this read with the error never inspected: one failed read and `row` was
 * null, the activation block was skipped, and the handler fell through to
 * `{ ok: true }`. Razorpay was told the event was processed, stopped
 * retrying, and a real capture was never activated — ERROR flattened into
 * "nothing to do" at the exact moment money arrived. A read failure must
 * surface as a thrown error the webhook answers with 500, so Razorpay
 * redelivers. Genuine absence (an order not in our ledger) stays null — that
 * is a legitimate answer, not a failure.
 *
 * Same contract as readUpgradeCredits and readMentorRoster: retry once so a
 * blip stays invisible, then throw. Deliberately NOT a generic ledger
 * abstraction — the webhook's order lookup and the refund lookup share the
 * error semantic, not a business primitive.
 */
export async function readWebhookPaymentRow(
  // Same loose client type the rest of the payment libs use.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: { from: (t: string) => any },
  orderId: string,
): Promise<WebhookPaymentRow | null> {
  let lastMessage = 'unknown';
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await admin
      .from('student_payments')
      // finding_kind / session_intent belong here. They were read by
      // activateSessionCredit and NEVER SELECTED, so `row.finding_kind` was
      // always undefined and every credit was minted with a null reason.
      .select('id, student_id, plan, status, coupon_code, amount, session_credit_id, finding_kind, finding_evidence, session_intent, session_intent_note')
      .eq('razorpay_order_id', orderId)
      .maybeSingle();
    if (!error) return (data as WebhookPaymentRow | null) ?? null;
    lastMessage = error.message;
  }
  throw new Error(`Could not read payment for webhook order: ${lastMessage}`);
}

/**
 * Read which student a refunded Razorpay payment belongs to — null ONLY when
 * the query succeeded and the payment is not in our ledger — or THROW.
 *
 * BOUNDARY 2, change 4: same disease on the refund path. A failed read made
 * the refund look like it belonged to nobody, the revoke was skipped, and the
 * webhook ACKed — so a refunded student kept premium forever, because
 * Razorpay never redelivers an acknowledged event. Retry once, then throw.
 */
/**
 * States a payment can never be activated OUT OF.
 *
 * 'paid' is a duplicate delivery — Razorpay redelivers, and that has always
 * been a legitimate no-op 200.
 *
 * 'refunded' is the one added on 28 Aug 2026, and it is a REGRESSION FIX for
 * the refund change made the same day. Both activation entry points guarded on
 * `row.status !== 'paid'`. While a refunded payment wrongly kept status='paid'
 * forever, that guard also — entirely by accident — blocked re-activation
 * after a refund. Writing 'refunded' removed the accidental protection: a
 * redelivered `payment.captured` (Razorpay retries an unacknowledged event for
 * hours, easily spanning a same-day refund) would have passed the guard, put
 * the row back to 'paid' beside a non-null refunded_at, and handed premium
 * back to a student who had been refunded.
 */
const NON_ACTIVATABLE = new Set(['paid', 'refunded']);

/**
 * May this payment still be activated? The ONE definition, so the webhook, the
 * checkout callback and any future caller cannot disagree about it.
 *
 * `undefined` is deliberately activatable: reconcile-payments selects its rows
 * without the status column and filters `.eq('status','created')` in the
 * query, so an absent status there means 'created', not "unknown and unsafe".
 */
export function mayActivatePayment(status: string | null | undefined): boolean {
  return !NON_ACTIVATABLE.has(status ?? '');
}

export interface RefundTarget { paymentId: string; studentId: string }

export async function readRefundTargetStudent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: { from: (t: string) => any },
  razorpayPaymentId: string,
): Promise<RefundTarget | null> {
  let lastMessage = 'unknown';
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await admin
      .from('student_payments')
      // OUR row id as well as the student (28 Aug). The refund has to reach
      // three places now, not one: revoke premium, take the payment out of the
      // paid ledger, and withdraw the counsellor's incentive on this sale
      // (sales_conversions is keyed on our payment id, not Razorpay's).
      .select('id, student_id')
      .eq('razorpay_payment_id', razorpayPaymentId)
      .maybeSingle();
    if (!error) {
      // Not in our ledger — a refund for someone else's payment. A legitimate
      // null, and the caller ACKs 200.
      if (!data?.student_id) return null;
      // In our ledger but missing its own primary key is impossible, so it is
      // corruption rather than an answer. Throwing keeps the module's rule
      // intact: never let an unreadable row look like "belongs to nobody",
      // which is precisely how a refunded student kept premium forever.
      if (!data?.id) throw new Error('Refund target row has no payment id');
      return { paymentId: data.id as string, studentId: data.student_id as string };
    }
    lastMessage = error.message;
  }
  throw new Error(`Could not read payment for refund: ${lastMessage}`);
}

/**
 * Take a refunded payment OUT of the paid ledger, and withdraw the incentive.
 *
 * Until 28 Aug 2026 the refund path revoked premium, wrote a timeline event
 * and a security event, and then left `student_payments.status = 'paid'`
 * forever. The status CHECK constraint had always permitted 'refunded';
 * nothing had ever written it. Every downstream reader therefore counted money
 * that had gone back: the founder's revenue screen, the rep portfolio's
 * "Won (paid)" tile, and — from 2 September, when the two counsellors start —
 * a 10% incentive on a sale the student had already been refunded for, which
 * Clause 7 of both engagement letters says explicitly must not happen.
 *
 * Throws on failure so the webhook 500s and Razorpay redelivers: a refund we
 * ACKed but never recorded is exactly the silent-loss shape that made this a
 * bug in the first place.
 */
export async function settleRefund(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: { from: (t: string) => any },
  target: RefundTarget,
  at: string = new Date().toISOString(),
): Promise<void> {
  const { error } = await admin
    .from('student_payments')
    .update({ status: 'refunded', refunded_at: at })
    .eq('id', target.paymentId)
    // Only a row still claiming to be paid moves, so a redelivered refund
    // cannot overwrite the original refunded_at with a later timestamp and
    // quietly shift which month loses the incentive.
    .eq('status', 'paid');
  if (error) throw new Error(`Could not mark payment refunded: ${error.message}`);
  await markConversionRefunded(admin, target.paymentId, at);
}

/**
 * Idempotent: callers must only pass a row whose status is not already 'paid',
 * and `activate_payment` itself is safe to retry. Returns false if the DB
 * transaction failed — the caller should surface that (webhook 500 → Razorpay
 * retries; cron → logged and retried next run).
 */
/**
 * A paid single session: mark the payment, mint ONE credit, and put it in the
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
  // A second delivery must never mint a second credit. This read USED to be
  // the whole guard, and it is a read-then-write race: the webhook and the
  // reconcile cron both read null and both insert. It happened on the very
  // first real Rs 299 payment — two credits, 12 milliseconds apart, on one
  // payment, each carrying a full Rs 299 mentor payout. The real guard is now
  // the UNIQUE constraint on session_credits.payment_id; this read stays only
  // to avoid a pointless insert attempt in the common case.
  const { data: existing } = await admin
    .from('session_credits').select('id').eq('payment_id', row.id).maybeSingle();

  // paid_at is part of what "paid" MEANS — the subscription path has always
  // stamped it (activate_payment RPC does `paid_at = now()`), and this path
  // did not. Every Rs 299 payment therefore landed in the ledger as paid with
  // no timestamp, which is the operations invariant that caught this.
  // ── THE STATUS PRECONDITION IS THE GUARD ──────────────────────────────────
  //
  // This update was filtered on `.eq('id', row.id)` alone, so it flipped ANY
  // row to 'paid' unconditionally — including one that had been refunded
  // between the webhook's status read and this line. The subscription path had
  // the identical hole in SQL (see 20260828c); this is the session half.
  //
  // Filtering on the status makes the DATABASE decide, atomically, instead of
  // trusting a value read several statements ago. `.select('id')` is what makes
  // the outcome observable: without it a no-op update and a successful one are
  // indistinguishable, and the code below would go on to mint a session credit
  // for a payment that had already been handed back.
  const { data: moved, error: payErr } = await admin
    .from('student_payments')
    .update({ status: 'paid', paid_at: new Date().toISOString(), razorpay_payment_id: paymentId ?? null })
    .eq('id', row.id)
    .in('status', ['created', 'failed'])
    .select('id');
  if (payErr) {
    console.error(`[activate:${source}] session payment update failed:`, payErr.message);
    return false;
  }
  if (!moved || moved.length === 0) {
    // Nothing moved, and the two reasons need OPPOSITE handling — so re-read
    // the row rather than guessing. An early return for both was the first
    // version of this fix and it introduced a worse bug than the one being
    // fixed: if a delivery marked the payment paid and then failed to mint the
    // credit, the retry would find 'paid', return true, and the student would
    // have paid ₹399 for a session credit that never existed.
    const { data: cur } = await admin
      .from('student_payments').select('status').eq('id', row.id).maybeSingle();
    const status = (cur as { status?: string } | null)?.status ?? null;

    if (status === 'refunded') {
      // A replay after a refund. Mint nothing.
      console.warn(`[activate:${source}] session payment ${row.id} is refunded — not re-activating`);
      return true;
    }
    if (status !== 'paid') {
      // Neither moved nor settled: something else is wrong with this row.
      console.error(`[activate:${source}] session payment ${row.id} did not move and is '${status}'`);
      return false;
    }
    // Already 'paid' — a duplicate delivery, or a retry after the credit
    // insert failed last time. FALL THROUGH: the credit insert below is
    // guarded by its own payment_id lookup, so it is safe to repeat and
    // necessary to attempt.
  }

  if (!existing) {
    const { error: creditErr } = await admin.from('session_credits').insert({
      student_id: row.student_id,
      payment_id: row.id,
      status: 'paid',
      amount_paise: row.amount ?? SESSION_PRICE_PAISE,
      finding_kind: row.finding_kind ?? null,
      finding_evidence: row.finding_evidence ?? null,
      // The student's stated reason, carried from the payment onto the
      // entitlement so the mentor opens the call already knowing the problem.
      session_intent: row.session_intent ?? null,
      session_intent_note: row.session_intent_note ?? null,
    });
    // 23505 = the unique constraint fired, i.e. a concurrent delivery already
    // minted this credit. That is SUCCESS, not failure: the entitlement the
    // student paid for exists exactly once.
    if (creditErr && creditErr.code !== '23505') {
      // The money arrived and the entitlement did not — the one failure here
      // that must be loud, because the student has paid for nothing.
      console.error(`[activate:${source}] SESSION CREDIT MINT FAILED`, creditErr.message);
      return false;
    }
  }

  // ── The three messages a paid session actually buys ────────────────────────────
  //
  // Until 24 Aug this line did not exist, and a session buyer received ZERO
  // messages — the 3-message entitlement was real but only the admin Mentor
  // Doors route ever issued one.
  //
  // Reuses mentor_grants rather than minting a second entitlement store. The
  // buddy is left NULL: it is filled when the session is assigned, and an
  // un-buddied grant is unspendable, so this cannot leak chat before there is
  // a mentor to chat with.
  //
  // ON CONFLICT DO NOTHING via the UNIQUE(student_id) constraint: a student who
  // already holds a grant (an earned door, or a previous session) keeps the one
  // they have. Buying twice must not silently reset a spent counter — the
  // allowance is raised deliberately, by a human, not by a repeat purchase.
  const { error: grantErr } = await admin.from('mentor_grants').insert({
    student_id: row.student_id,
    door: 'session',
    activated_at: new Date().toISOString(),
    messages_allowance: MENTOR_FREE_MESSAGES,
  });
  if (grantErr && grantErr.code !== '23505') {
    // Reported, not fatal: the session they paid for is the product. Losing
    // the three messages must not fail the payment activation.
    console.error(`[activate:${source}] session chat grant failed:`, grantErr.message);
  }

  // ── Assign a mentor, right now ───────────────────────────────────────────
  //
  // The gap this closes: a credit was minted and then nothing happened. Nobody
  // was assigned, no session existed, and a human had to build the row by hand.
  //
  // NEVER fatal, and never consumes the credit. If no mentor has capacity the
  // student still owns exactly what they paid for — the credit waits at `paid`
  // and the founder view can see it waiting. Losing an entitlement because the
  // roster was briefly empty is the one outcome to avoid.
  //
  // Assigns session_credits.buddy_id ONLY. profiles.buddy_id is the ongoing
  // premium relationship and is deliberately untouched: a one-off session must
  // never become a permanent mentorship.
  const { data: fresh } = await admin
    .from('session_credits').select('id').eq('payment_id', row.id).maybeSingle();
  let mentorAssigned = false;
  if (fresh?.id) {
    const assigned = await assignBuddyToCredit(admin, {
      creditId: fresh.id as string,
      studentId: row.student_id,
      sessionIntent: row.session_intent ?? null,
      findingKind: row.finding_kind ?? null,
    });
    if (!assigned.ok) {
      console.error(`[activate:${source}] session not assigned yet:`, assigned.failure);
    } else {
      // The three messages become spendable only now — the grant was minted
      // with no buddy, and an un-buddied grant is unspendable by design.
      await admin.from('mentor_grants')
        .update({ buddy_id: assigned.buddyId })
        .eq('student_id', row.student_id)
        .is('buddy_id', null);
      mentorAssigned = true;
    }
  }

  // ── TELL THE STUDENT THEY'RE BOOKED ─────────────────────────────────────
  //
  // This function minted the credit, the chat grant and the mentor
  // assignment, and until now told the student none of it — the ONLY session
  // ever bought and assigned in production (Dhruv Vakadia, 24 Aug) got zero
  // notifications in the ten minutes after paying. The subscription path's
  // own premium-grant helper (lib/premium.ts) already closes this exact
  // silence for the ₹999/₹2,599 plans; this is its session-credit sibling.
  //
  // Two honest variants, not one. A confirmed mentor is a stronger claim than
  // "we're looking" — and the "still looking" copy promises NO timeframe on
  // purpose: nothing retries an unassigned credit on a schedule (see the
  // comment above assignBuddyToCredit), so a fixed "within 24 hours" here
  // would be exactly the kind of claim beyond the evidence this app refuses
  // to print. Fires regardless of whether assignment succeeded — the payment
  // itself is real either way, and that is the fact this message exists to
  // confirm reached the phone, not the bell.
  const { data: notifProfile } = await admin
    .from('profiles').select('notif_prefs').eq('id', row.student_id).single();
  await dispatch({
    userId: row.student_id,
    type: 'session_booked',
    title: mentorAssigned ? '🎉 Session booked!' : '✅ Payment received',
    body: mentorAssigned
      ? "Your mentor is confirmed and will reach out soon. Log today's study while you wait."
      : "We're matching you with a mentor now — you'll hear from them here the moment it's confirmed.",
    url: '/student/buddy',
    reason: 'Session payment just captured — confirm it landed, immediately',
    expectedAction: 'open_buddy',
    prefs: (notifProfile?.notif_prefs as Record<string, unknown>) ?? {},
  });

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
  // ── A REFUNDED PAYMENT IS NEVER RE-ACTIVATED ──────────────────────────────
  //
  // Defence in depth, and the reason it is HERE rather than only at the two
  // call sites: both of them independently wrote `row.status !== 'paid'`, and
  // both were silently wrong the moment 'refunded' became a real status. A
  // rule that every caller has to remember is a rule that gets forgotten by
  // the third caller.
  //
  // Returns TRUE, not false: this is a legitimate no-op, not a failure. A
  // false here would 500 the webhook and make Razorpay redeliver the same
  // impossible event indefinitely.
  if (!mayActivatePayment(row.status)) {
    console.warn(`[activate:${source}] refused — payment ${row.id} is '${row.status}', not activatable`);
    return true;
  }

  // ── WHO SOLD THIS, decided once, here ─────────────────────────────────────
  //
  // Deliberately ABOVE the plan branch, so the single session and every
  // subscription are attributed by the same line of code. Putting it in each
  // branch would be two copies of one rule, and the ₹399 session — the offer
  // the counsellors actually pitch — is exactly the one that would drift.
  //
  // Runs before activation rather than after: Razorpay has already captured
  // the money by the time we are called, so the sale is real whether or not
  // our own activation then succeeds. It never throws and never blocks (D3),
  // and `payment_id` is the primary key, so a redelivered webhook re-running
  // this whole function cannot pay a counsellor twice.
  await recordConversion(admin, {
    paymentId: row.id,
    studentId: row.student_id,
    amountPaise: row.amount ?? 0,
    plan: row.plan ?? null,
  });

  // ── The single session takes a DIFFERENT road ──────────────────────────────
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

  // The entry ladder: the payment is real, so the credit that
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
