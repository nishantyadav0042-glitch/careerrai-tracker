import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { dispatch, BUDGET_RECOVERY } from '@/lib/notification-os';
import { getLogDateString } from '@/lib/streak-utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// 15:30 UTC = 21:00 IST. The founder's daily guarantee (21 July): every
// student we can reach gets at least ONE push every day until they uninstall
// — whether they open the app or not. The state ladders (companion, recovery,
// activation) already cover most students; this cron is the safety net for
// the ones every ladder has released (dark students past the day-14 win-back,
// plan-ready students past the activation ladder). Anyone with a live
// subscription and ZERO accepted pushes today gets one honest evening nudge.
// Rides dispatch(), so it's budgeted, measured, and under the 10/day hard cap
// like everything else.
export async function GET(request: NextRequest) {
  if (!authorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const admin = createAdminClient();
  const logDay = getLogDateString();
  const todayStart =
    new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) + 'T00:00:00+05:30';

  const [{ data: students }, { data: pushedRows }, { data: todayLogs }] = await Promise.all([
    admin.from('profiles')
      .select('id, full_name, notif_prefs')
      .eq('role', 'student')
      .not('is_test_account', 'is', true)
      .not('is_demo', 'is', true)
      .not('push_subscription', 'is', null),
    admin.from('notifications')
      .select('user_id')
      .not('pushed_at', 'is', null)
      .gte('pushed_at', todayStart),
    admin.from('daily_reports').select('student_id').eq('report_date', logDay),
  ]);
  const pushedIds = new Set((pushedRows ?? []).map((r) => r.user_id as string));
  const loggedIds = new Set((todayLogs ?? []).map((r) => r.student_id as string));

  let sent = 0;
  let skipped = 0;
  for (const s of students ?? []) {
    if (pushedIds.has(s.id)) { skipped++; continue; }
    const first = ((s.full_name as string | null) ?? '').trim().split(' ')[0] || 'there';
    const loggedToday = loggedIds.has(s.id);
    const outcome = await dispatch({
      userId: s.id,
      type: 'daily_heartbeat',
      title: loggedToday ? `Good work today, ${first}` : 'Aaj ka log baki hai',
      body: loggedToday
        ? 'Today is logged. Same time tomorrow — consistency is the whole game.'
        : '30 seconds, that’s all a log takes. Even an honest 0-hour day counts — what matters is showing up.',
      url: '/student/tracker',
      reason: 'Daily guarantee: reachable student had zero pushes today — every reachable student hears from us daily',
      expectedAction: 'log_today',
      prefs: (s.notif_prefs as Record<string, unknown> | null) ?? {},
      dailyBudget: BUDGET_RECOVERY,
    });
    if (outcome === 'sent') sent++;
  }

  return NextResponse.json({ reachable: (students ?? []).length, alreadyPushedToday: skipped, heartbeatsSent: sent });
}
