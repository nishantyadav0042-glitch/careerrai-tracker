import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushToUser } from '@/lib/push';
import { isRequestAdmin } from '@/lib/require-admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// One-shot production push test (founder-ordered, 21 July): a single
// highest-priority notification to every reachable student, sent from
// production infrastructure so both Google's and Apple's push services are hit
// exactly the way the daily crons hit them. Idempotent — a student who already
// has a kohli_18 row is never sent twice, so re-invoking to sweep stragglers
// is safe.
//
// Auth (hardened 24 Jul audit): requires a signed-in ADMIN session. The old
// `?key=<secret>` URL auth leaked the secret via access logs/Referer and let a
// key-holder push to any user id; the bulk response also enumerated every
// student's name (PII). Both removed.
export async function GET(request: NextRequest) {
  if (!(await isRequestAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  // Targeted end-to-end test: ?student=<uuid> pushes to that ONE account
  // (test accounts allowed, resend allowed) — for verifying a specific
  // device with the app force-stopped. Stamp chain: pushed_at (service
  // accepted) → received_at (device got it, app still closed) → clicked_at.
  const target = request.nextUrl.searchParams.get('student');
  if (target) {
    const { data: row } = await admin
      .from('notifications')
      .insert({
        user_id: target, type: 'e2e_test',
        title: 'CareerRai delivery test',
        body: 'If you can read this with the app closed, the push pipeline to this device is fully working.',
        data: { url: '/student/tracker' }, read: false, channel: 'in_app',
        reason: 'Founder-ordered end-to-end delivery test on a specific device',
        expected_action: 'open_plan',
      })
      .select('id')
      .single();
    const res = await sendPushToUser(target, {
      title: 'CareerRai delivery test',
      body: 'If you can read this with the app closed, the push pipeline to this device is fully working.',
      url: '/student/tracker', notifId: row?.id as string,
    });
    if (res.ok && row?.id) {
      await admin.from('notifications').update({ pushed_at: new Date().toISOString() }).eq('id', row.id);
    }
    return NextResponse.json({ target, pushAccepted: res.ok, reason: res.reason ?? null, notifId: row?.id ?? null });
  }

  const { data: students } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'student')
    .not('is_test_account', 'is', true)
    .not('is_demo', 'is', true)
    .not('push_subscription', 'is', null);

  const title = 'Virat ki jersey: 18. Aapke paas: 18 weeks.';
  const body =
    'Kohli is Kohli because he shows up every day. Roughly 18 weeks to CAT — give your prep that consistency. Start with today’s log.';
  const url = '/student/tracker';

  // Aggregate counts only — no per-student names in the response (PII).
  const outcomes: Record<string, number> = {};
  let pushed = 0;
  for (const s of students ?? []) {
    const { count } = await admin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', s.id)
      .eq('type', 'kohli_18');
    if ((count ?? 0) > 0) {
      outcomes.already_sent = (outcomes.already_sent ?? 0) + 1;
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
      outcomes.pushed = (outcomes.pushed ?? 0) + 1;
    } else {
      const reason = res.reason ?? 'failed';
      outcomes[reason] = (outcomes[reason] ?? 0) + 1;
    }
  }

  return NextResponse.json({ eligible: (students ?? []).length, pushed, outcomes });
}
