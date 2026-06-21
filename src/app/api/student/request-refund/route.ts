import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const REQUIRED_DAYS = 20;

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
  if (!profile?.subscription_status || !['active', 'free_beta'].includes(profile.subscription_status)) {
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

  // Count daily_reports in the first 30 days from account creation
  const joinedAt = new Date(profile.created_at);
  const thirtyDaysLater = new Date(joinedAt.getTime() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const { count: daysLogged } = await admin
    .from('daily_reports')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', user.id)
    .lte('report_date', thirtyDaysLater);

  const days = daysLogged ?? 0;
  if (days < REQUIRED_DAYS) {
    return NextResponse.json({
      error: `You need ${REQUIRED_DAYS} days logged in your first month to qualify. You have ${days} so far.`,
      daysLogged: days,
      required: REQUIRED_DAYS,
    }, { status: 400 });
  }

  // Insert request and mark subscription
  await admin.from('refund_requests').insert({ student_id: user.id, days_logged: days });
  await admin.from('profiles').update({ subscription_status: 'refund_requested' }).eq('id', user.id);

  return NextResponse.json({ ok: true, daysLogged: days });
}
