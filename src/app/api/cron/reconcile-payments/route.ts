import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { fetchOrderPayments } from '@/lib/razorpay';
import { activatePaidOrder } from '@/lib/activate-payment';

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

export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = createAdminClient();

  const now = Date.now();
  const { data: stuck } = await admin
    .from('student_payments')
    .select('id, student_id, plan, coupon_code, amount, razorpay_order_id, created_at')
    .eq('status', 'created')
    .not('razorpay_order_id', 'is', null)
    .lt('created_at', new Date(now - MIN_AGE_MINUTES * 60_000).toISOString())
    .gt('created_at', new Date(now - MAX_AGE_DAYS * 86_400_000).toISOString())
    .order('created_at', { ascending: true })
    .limit(BATCH);

  if (!stuck?.length) return NextResponse.json({ checked: 0, rescued: 0, abandoned: 0 });

  let rescued = 0;
  let abandoned = 0;
  const errors: string[] = [];

  for (const row of stuck) {
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
      if (payments.some((p) => p.status === 'failed')) {
        await admin.from('student_payments').update({ status: 'failed' }).eq('id', row.id);
        abandoned++;
      }
    } catch (e) {
      errors.push(orderId);
      console.error(`[reconcile-payments] ${orderId}:`, e instanceof Error ? e.message : e);
    }
  }

  return NextResponse.json({ checked: stuck.length, rescued, abandoned, errors: errors.length });
}

export { POST as GET };
