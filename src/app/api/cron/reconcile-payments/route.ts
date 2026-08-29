import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { withCronTracking } from '@/lib/cron-run-tracker';
import { fetchOrderPayments } from '@/lib/razorpay';
import { activatePaidOrder } from '@/lib/activate-payment';
import { failureFacts } from '@/lib/payment-failure';

export const maxDuration = 300;

// The money safety net.
//
// Normally the Razorpay webhook activates a payment within seconds. But a
// webhook can be missed — a bad/rotated RAZORPAY_WEBHOOK_SECRET makes us drop
// the event on purpose (see webhook/route.ts), a deploy can land mid-delivery,
// and Razorpay eventually stops retrying. When that happens the student HAS
// paid, and we show them a paywall. That is the worst bug this product can
// have, and it is invisible without this job.
//
// So: for every order still sitting at 'created', ask Razorpay directly what
// really happened. Razorpay is the source of truth, not our webhook log.

// Give the webhook a head start — below this, a 'created' row is just a
// checkout still in progress, not a miss.
const MIN_AGE_MINUTES = 10;
// Razorpay orders expire; past this an unpaid order is simply abandoned.
const MAX_AGE_DAYS = 7;
const BATCH = 50;
// How many already-settled failures we ask Razorpay about per tick. Small on
// purpose: this is a backlog drain running every 15 minutes, not a burst, and
// it shares a run with the money-critical rescue loop above — it must never be
// the reason that loop times out.
const EXPLAIN_BATCH = 20;

export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return withCronTracking('/api/cron/reconcile-payments', async () => {
    const admin = createAdminClient();

    const now = Date.now();
    const { data: stuck } = await admin
      .from('student_payments')
      // Same columns as the webhook path: a reconciled payment must mint a
      // credit carrying the same reason the webhook would have. Written as ONE
      // string literal — a concatenated select defeats the client's column
      // type inference and every field comes back as an error type.
      .select('id, student_id, plan, coupon_code, amount, session_credit_id, razorpay_order_id, created_at, finding_kind, finding_evidence, session_intent, session_intent_note')
      .eq('status', 'created')
      .not('razorpay_order_id', 'is', null)
      .lt('created_at', new Date(now - MIN_AGE_MINUTES * 60_000).toISOString())
      .gt('created_at', new Date(now - MAX_AGE_DAYS * 86_400_000).toISOString())
      .order('created_at', { ascending: true })
      .limit(BATCH);

    // NO EARLY RETURN on an empty `stuck`. It used to bail here, and with the
    // explain pass below that would have meant the backlog of unexplained
    // failures was only ever drained on the rare tick that also happened to
    // find an in-flight order — i.e. almost never.

    let rescued = 0;
    let abandoned = 0;
    const errors: string[] = [];

    for (const row of stuck ?? []) {
      const orderId = row.razorpay_order_id as string;
      try {
        const payments = await fetchOrderPayments(orderId);
        const captured = payments.find((p) => p.status === 'captured');

        if (captured) {
          // Real money we never credited. Activate exactly as the webhook would.
          const ok = await activatePaidOrder(
            admin,
            { id: row.id, student_id: row.student_id, plan: row.plan, coupon_code: row.coupon_code, amount: row.amount },
            orderId,
            captured.id,
            'reconcile',
          );
          if (ok) {
            rescued++;
            console.error(`[reconcile-payments] RESCUED missed payment — order=${orderId} student=${row.student_id}`);
          } else {
            errors.push(orderId);
          }
          continue;
        }

        // No capture. Record the real end-state so abandoned checkouts stop
        // being indistinguishable from in-flight ones — this is what makes
        // checkout drop-off measurable instead of a permanent 'created' row.
        //
        // And record WHY (Incident #58). Razorpay already told us in this same
        // response; writing only the status threw the diagnosis away.
        const facts = failureFacts(payments, new Date().toISOString());
        if (facts) {
          await admin.from('student_payments').update({ status: 'failed', ...facts }).eq('id', row.id);
          abandoned++;
        }
      } catch (e) {
        errors.push(orderId);
        console.error(`[reconcile-payments] ${orderId}:`, e instanceof Error ? e.message : e);
      }
    }

    // ── THE EXPLAIN PASS (Incident #58) ────────────────────────────────────
    //
    // The loop above only ever looks at rows still sitting at 'created'. The
    // moment one is marked 'failed' it leaves that population forever, so a
    // row that was failed BEFORE this cron learned to record a reason would
    // stay unexplained for the rest of its life — including the two 25 Aug
    // iOS attempts that are the whole reason this exists.
    //
    // Razorpay keeps payment history indefinitely, so the answer is still
    // there for the asking. This pass asks once per row, oldest first, and
    // stamps failure_seen_at whether or not an error code came back — which is
    // what stops it asking the same row again tomorrow and what keeps "we
    // asked and got nothing" distinguishable from "we never asked".
    //
    // No MIN_AGE and no MAX_AGE here on purpose: these rows are already
    // settled, so there is no webhook to wait for, and an old unexplained
    // failure is exactly as worth explaining as a new one.
    let explained = 0;
    const { data: unexplained } = await admin
      .from('student_payments')
      .select('id, razorpay_order_id')
      .eq('status', 'failed')
      .is('failure_seen_at', null)
      .not('razorpay_order_id', 'is', null)
      .order('created_at', { ascending: true })
      .limit(EXPLAIN_BATCH);

    for (const row of unexplained ?? []) {
      const orderId = row.razorpay_order_id as string;
      try {
        const facts = failureFacts(await fetchOrderPayments(orderId), new Date().toISOString());
        // A row marked 'failed' whose order shows no failed attempt is a
        // contradiction we must not paper over: stamp the timestamp so it is
        // not re-queried forever, and leave every reason column NULL so it
        // reads as "asked, no failure reported" rather than as a real cause.
        await admin
          .from('student_payments')
          .update(facts ?? { failure_seen_at: new Date().toISOString() })
          .eq('id', row.id);
        explained++;
      } catch (e) {
        errors.push(orderId);
        console.error(`[reconcile-payments] explain ${orderId}:`, e instanceof Error ? e.message : e);
      }
    }

    return NextResponse.json({ checked: stuck?.length ?? 0, rescued, abandoned, explained, errors: errors.length });
  });
}

export { POST as GET };
