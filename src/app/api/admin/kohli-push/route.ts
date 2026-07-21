import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushToUser } from '@/lib/push';
import { getServerConfig } from '@/lib/server-config';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// One-shot production push test (founder-ordered, 21 July): a single
// highest-priority notification to every reachable student, sent from
// production infrastructure so both Google's and Apple's push services are hit
// exactly the way the daily crons hit them. Idempotent — a student who already
// has a kohli_18 row is never sent twice, so re-invoking to sweep stragglers
// is safe. Auth: one-time key held in server_config (KOHLI_PUSH_KEY); rotate
// or delete the row to disable this endpoint.
export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key');
  const expected = await getServerConfig('KOHLI_PUSH_KEY');
  if (!expected || !key || key !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: students } = await admin
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'student')
    .not('is_test_account', 'is', true)
    .not('is_demo', 'is', true)
    .not('push_subscription', 'is', null);

  const title = 'Virat ki jersey: 18. Aapke paas: 18 weeks.';
  const body =
    'Kohli is Kohli because he shows up every day. Roughly 18 weeks to CAT — give your prep that consistency. Start with today’s log.';
  const url = '/student/tracker';

  const results: { name: string | null; outcome: string }[] = [];
  let pushed = 0;
  for (const s of students ?? []) {
    const { count } = await admin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', s.id)
      .eq('type', 'kohli_18');
    if ((count ?? 0) > 0) {
      results.push({ name: s.full_name, outcome: 'already_sent' });
      continue;
    }
    const { data: row } = await admin
      .from('notifications')
      .insert({
        user_id: s.id, type: 'kohli_18', title, body,
        data: { url }, read: false, channel: 'in_app',
        reason: 'Founder-ordered live delivery test to every reachable student (21 July)',
        expected_action: 'log_today',
      })
      .select('id')
      .single();
    const res = await sendPushToUser(s.id, { title, body, url, notifId: row?.id as string });
    if (res.ok && row?.id) {
      await admin.from('notifications').update({ pushed_at: new Date().toISOString() }).eq('id', row.id);
      pushed++;
      results.push({ name: s.full_name, outcome: 'pushed' });
    } else {
      results.push({ name: s.full_name, outcome: res.reason ?? 'failed' });
    }
  }

  return NextResponse.json({ eligible: (students ?? []).length, pushed, results });
}
