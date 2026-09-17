import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { REFUND_REQUIRED_DAYS, refundWindow, refundShortfallMessage } from '@/lib/refund-policy';

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const admin = createAdminClient();

  // Must be a student with an active subscription
  const { data: profile } = await admin
    .from('profiles')
    .select('role, subscription_status, created_at')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'student') {
    return NextResponse.json({ error: 'Not a student account.' }, { status: 403 });
  }
  // Refunds apply only to a genuinely PAID subscription. Free users never
  // paid, so they must not be able to open a refund request (it only pollutes
  // the admin queue and flips their own status).
  if (profile?.subscription_status !== 'active') {
    return NextResponse.json({ error: 'No active subscription to refund.' }, { status: 400 });
  }

  // Check for existing request
  const { data: existing } = await admin
    .from('refund_requests')
    .select('id, status')
    .eq('student_id', user.id)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: 'You already have a refund request on file.', status: existing.status }, { status: 409 });
  }

  // Logged study days inside the refund window. The window and the bar both
  // come from src/lib/refund-policy.ts — the same module the progress bar on
  // the profile card and the three public policy pages read, so what a student
  // is promised and what this route enforces cannot drift apart.
  const { start, end } = refundWindow(profile.created_at);
  const { count: daysLogged } = await admin
    .from('daily_reports')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', user.id)
    .gte('report_date', start)
    .lte('report_date', end);

  const days = daysLogged ?? 0;
  if (days < REFUND_REQUIRED_DAYS) {
    return NextResponse.json({
      error: refundShortfallMessage(days),
      daysLogged: days,
      required: REFUND_REQUIRED_DAYS,
    }, { status: 400 });
  }

  // Insert request and mark subscription
  await admin.from('refund_requests').insert({ student_id: user.id, days_logged: days });
  await admin.from('profiles').update({ subscription_status: 'refund_requested' }).eq('id', user.id);

  return NextResponse.json({ ok: true, daysLogged: days });
}
