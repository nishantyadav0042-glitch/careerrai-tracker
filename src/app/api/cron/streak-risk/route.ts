import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushToUser } from '@/lib/push';
import { pickStreakRiskVariant } from '@/lib/notification-engine';
import { authorizedCron } from '@/lib/cron-auth';

// 16:00 UTC = 21:30 IST. The last-chance push: fires ONLY for students with a
// real streak (>= 2 days) who still haven't logged today. Loss aversion is the
// strongest open trigger we have — but only when there is something to lose,
// so students without a streak never get this second nag.
export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const todayStart = new Date(today + 'T00:00:00+05:30').toISOString();

  const { data: streaks } = await admin
    .from('streak_data')
    .select('student_id, current_streak')
    .gte('current_streak', 2);
  if (!streaks?.length) return NextResponse.json({ sent: 0, reason: 'no_streaks_at_risk' });

  const ids = streaks.map((s) => s.student_id);
  const [{ data: todayReports }, { data: sentToday }, { data: profiles }] = await Promise.all([
    admin.from('daily_reports').select('student_id').in('student_id', ids).eq('report_date', today),
    admin.from('notifications').select('user_id').in('user_id', ids).eq('type', 'streak_risk').gte('created_at', todayStart),
    admin.from('profiles').select('id, full_name, notif_prefs, dream_colleges, is_demo').in('id', ids),
  ]);

  const logged = new Set((todayReports ?? []).map((r) => r.student_id));
  const already = new Set((sentToday ?? []).map((n) => n.user_id));
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const streakById = new Map(streaks.map((s) => [s.student_id, s.current_streak ?? 0]));

  let sent = 0;
  for (const s of streaks) {
    if (logged.has(s.student_id) || already.has(s.student_id)) continue;
    const p = profileById.get(s.student_id);
    if (!p || p.is_demo) continue;
    const prefs = (p.notif_prefs ?? {}) as Record<string, unknown>;
    if (prefs.daily_reminder === false) continue;

    const { title, body } = pickStreakRiskVariant(
      { name: p.full_name.split(' ')[0], streak: streakById.get(s.student_id) ?? 0, dreamCollege: ((p.dream_colleges as string[] | null)?.[0]) ?? null },
      []
    );

    await admin.from('notifications').insert({
      user_id: s.student_id, type: 'streak_risk', title, body,
      data: { url: '/student/tracker' }, read: false, channel: 'in_app',
    });
    if (prefs.push === true) await sendPushToUser(s.student_id, { title, body, url: '/student/tracker' });
    sent++;
  }

  return NextResponse.json({ sent, atRisk: streaks.length });
}

export { POST as GET };
