import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { dispatch, BUDGET_RECOVERY } from '@/lib/notification-os';
import { getLogDateString } from '@/lib/streak-utils';
import { withCronTracking } from '@/lib/cron-run-tracker';

import { fetchAll } from '@/lib/supabase/fetch-all';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// 02:30 UTC = 08:00 AM IST. The morning "you forgot yesterday" nudge.
//
// Founder, 10 Aug: "Give students maximum time to fill yesterday's log so they
// feel motivated and come back today and tomorrow — we are not trying to break
// streaks, we want maximum daily logs for maximum days. Remind at 8 AM, ONLY
// those who opened the app yesterday but didn't log, and skip anyone who already
// logged."
//
// So this is a surgical, positive nudge, not a guilt trip. The audience is
// exactly the recoverable gap the Analytics screen shows: opened yesterday,
// no log for yesterday. It deep-links straight into the log sheet pre-set to
// BACKDATE yesterday (/student/tracker?log=yesterday), which the log form
// already allows (today|yesterday). And because the streak is recomputed from
// full history by date (upsert_log_and_streak, gaps-and-islands), a yesterday
// log filled at 8 AM rejoins the run and KEEPS THE STREAK ALIVE — no cutoff
// change, no streak surgery. Rides dispatch(), so it is budgeted, deduped and
// under the daily cap like every other nudge.
export async function GET(request: NextRequest) {
  if (!authorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return withCronTracking('/api/cron/log-yesterday-reminder', async () => logYesterdayReminderRun());
}

async function logYesterdayReminderRun(): Promise<NextResponse> {
  const admin = createAdminClient();

  // At 08:00 IST the log-day is today (past the 3 AM cutoff); "yesterday" is the
  // day that just closed and is still backdatable from the log form.
  const today = getLogDateString();
  const yesterday = new Date(Date.parse(today) - 86_400_000).toISOString().slice(0, 10);
  // Calendar-IST day boundaries for "opened yesterday" — the SAME convention the
  // admin Analytics "opened vs logged" panel uses, so this audience is exactly
  // the gap the founder sees there.
  const yStart = `${yesterday}T00:00:00+05:30`;
  const yEnd = `${today}T00:00:00+05:30`;

  const [{ data: students }, { data: openedRows }, { data: loggedRows }] = await Promise.all([
    fetchAll(() => admin.from('profiles')
      .select('id, full_name, notif_prefs')
      .eq('role', 'student')
      // demo accounts are shared logins; test accounts stay in (the founder
      // tests as a student), same stance as daily-heartbeat.
      .not('is_demo', 'is', true)
      // Only students we can actually reach at 8 AM — a live push subscription.
      .not('push_subscription', 'is', null)),
    fetchAll(() => admin.from('student_events')
      .select('user_id')
      .eq('event', 'app_open')
      .gte('created_at', yStart).lt('created_at', yEnd)),
    fetchAll(() => admin.from('daily_reports')
      .select('student_id')
      .eq('report_date', yesterday)),
  ]);

  const openedYesterday = new Set((openedRows ?? []).map((r) => r.user_id as string));
  const loggedYesterday = new Set((loggedRows ?? []).map((r) => r.student_id as string));

  let sent = 0;
  let skippedNotOpened = 0;
  let skippedAlreadyLogged = 0;
  for (const s of students ?? []) {
    // Only those who OPENED yesterday — this is a "you were here, finish the
    // one thing" nudge, never a cold poke at someone who never showed up.
    if (!openedYesterday.has(s.id)) { skippedNotOpened++; continue; }
    // Skip anyone who already logged yesterday — the whole point.
    if (loggedYesterday.has(s.id)) { skippedAlreadyLogged++; continue; }

    const name = ((s.full_name as string | null) ?? '').split(' ')[0];
    const outcome = await dispatch({
      userId: s.id,
      type: 'log_recovery',
      title: name ? `${name}, kal ka log reh gaya 📝` : 'Kal ka log reh gaya 📝',
      body: 'You opened CareerRai yesterday but the log is still empty. 20 seconds to fill it — your streak stays alive. 🔥',
      url: '/student/tracker?log=yesterday',
      reason: 'Opened the app yesterday and did not log it — recover the log while yesterday is still fillable, keep the streak alive',
      expectedAction: 'log_today',
      prefs: (s.notif_prefs as Record<string, unknown> | null) ?? {},
      dailyBudget: BUDGET_RECOVERY,
    });
    if (outcome === 'sent') sent++;
  }

  return NextResponse.json({
    logDay: yesterday,
    openedYesterday: openedYesterday.size,
    remindersSent: sent,
    skippedAlreadyLogged,
    skippedNotOpened,
  });
}
