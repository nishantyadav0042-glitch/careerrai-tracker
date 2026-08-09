import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { grantPremiumAndQueueBuddy } from '@/lib/premium';
import { logAdminAction } from '@/lib/audit';
import { emitTimeline } from '@/lib/os/timeline';
import { NextRequest, NextResponse } from 'next/server';

// Retry the premium unlock for a payment that was CAPTURED but never activated.
//
// This is the founder's one-click fix for the crown-jewel sacred fault: money
// is `paid` but the student is still free because grantPremium didn't stick
// (a transient failure the webhook/reconcile path left behind). The Payment 360
// banner said "Retry the unlock" and had no button; this is the button.
//
// SECURITY INVARIANT, preserved deliberately: this route NEVER flips a payment
// from created→paid. It refuses anything whose status is not already `paid`, so
// it cannot become a signature-bypass path to grant premium for unpaid money —
// the whole reason payments unlock only through the signature-verified webhook
// and the reconcile cron. All it does is re-run grantPremiumAndQueueBuddy, which
// is idempotent, for a row a verified path already marked paid.
export async function POST(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { payment_id } = await request.json();
  if (!payment_id) return NextResponse.json({ error: 'Missing payment_id' }, { status: 400 });

  const { data: pay } = await admin
    .from('student_payments')
    .select('id, student_id, status, amount, plan')
    .eq('id', payment_id)
    .maybeSingle();
  if (!pay) return NextResponse.json({ error: 'Payment not found' }, { status: 404 });

  // The invariant: only a genuinely-captured payment can be unlocked. A created
  // or failed row is not money in the bank and must never grant premium here.
  if (pay.status !== 'paid') {
    return NextResponse.json(
      { error: `Payment is "${pay.status}", not paid — unlock only completes a captured payment.` },
      { status: 409 },
    );
  }

  const { data: before } = await admin
    .from('profiles').select('is_premium').eq('id', pay.student_id).maybeSingle();
  if (before?.is_premium === true) {
    return NextResponse.json({ ok: true, premium: true, alreadyPremium: true });
  }

  await grantPremiumAndQueueBuddy(admin, pay.student_id);

  const { data: after } = await admin
    .from('profiles').select('is_premium').eq('id', pay.student_id).maybeSingle();
  const nowPremium = after?.is_premium === true;

  logAdminAction(user.id, 'retry_unlock', 'payment', payment_id, { student_id: pay.student_id, nowPremium });

  if (nowPremium) {
    await emitTimeline(admin, {
      entity: 'student', entityId: pay.student_id, kind: 'subscribed',
      summary: `Premium unlocked — manual repair (₹${(pay.amount ?? 0) / 100}, ${pay.plan})`,
      actor: 'admin', metadata: { payment_id, source: 'admin_retry_unlock' },
    });
  }

  return NextResponse.json({ ok: true, premium: nowPremium });
}
