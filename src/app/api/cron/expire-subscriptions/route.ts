import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Memberships are one-time purchases, not auto-debit. When a term ends we flip
// the student from 'active' to 'expired' so the membership card re-shows the
// plan buttons and they can renew manually. Runs daily.
export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  // Find active subscriptions whose renewal date has already passed.
  const { data: lapsed, error } = await admin
    .from('profiles')
    .select('id, full_name')
    .eq('subscription_status', 'active')
    .lt('subscription_renews_at', nowIso);

  if (error) {
    console.error('[expire-subscriptions]', error);
    return NextResponse.json({ error: 'query failed' }, { status: 500 });
  }
  if (!lapsed?.length) return NextResponse.json({ expired: 0 });

  const ids = lapsed.map((p) => p.id);

  const { error: updateErr } = await admin
    .from('profiles')
    .update({ subscription_status: 'expired' })
    .in('id', ids);

  if (updateErr) {
    console.error('[expire-subscriptions]', updateErr);
    return NextResponse.json({ error: 'update failed' }, { status: 500 });
  }

  // Nudge each student in-app so they know to renew.
  await admin.from('notifications').insert(
    lapsed.map((p) => ({
      user_id: p.id,
      type: 'membership',
      title: 'Your membership has ended',
      body: 'Renew anytime from your profile to keep full access.',
      data: {},
      read: false,
      channel: 'in_app',
    }))
  );

  return NextResponse.json({ expired: ids.length });
}

export { POST as GET };
