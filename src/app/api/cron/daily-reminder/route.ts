import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendDailyReminder } from '@/lib/email';
import { sendPushToUser } from '@/lib/push';
import { pickNoLogVariant } from '@/lib/notification-engine';
import { authorizedCron } from '@/lib/cron-auth';

// Called by Vercel Cron at 14:30 UTC = 8:00 PM IST every day.
export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const todayStart = new Date(today + 'T00:00:00+05:30').toISOString();

  const { data: students } = await admin
    .from('profiles')
    .select('id, full_name, email, notif_prefs, dream_colleges')
    .eq('role', 'student');
  if (!students?.length) return NextResponse.json({ reminded: 0 });

  const studentIds = students.map((s) => s.id);

  const [
    { data: todayReports },
    { data: streakRows },
    { data: recentNotifs },
    { data: todayNotifs },
  ] = await Promise.all([
    admin.from('daily_reports').select('student_id').in('student_id', studentIds).eq('report_date', today),
    admin.from('streak_data').select('student_id, current_streak').in('student_id', studentIds),
    admin.from('notifications').select('user_id, title').in('user_id', studentIds).eq('type', 'daily_reminder')
      .gte('created_at', new Date(Date.now() - 10 * 86_400_000).toISOString()).order('created_at', { ascending: false }),
    admin.from('notifications').select('user_id').in('user_id', studentIds).eq('type', 'daily_reminder').gte('created_at', todayStart),
  ]);

  const submittedIds = new Set((todayReports ?? []).map((r) => r.student_id));
  const streakMap = new Map((streakRows ?? []).map((r) => [r.student_id, r.current_streak ?? 0]));
  const reminderSentToday = new Set((todayNotifs ?? []).map((n) => n.user_id));

  const recentTitlesByStudent = new Map<string, string[]>();
  for (const n of recentNotifs ?? []) {
    if (!recentTitlesByStudent.has(n.user_id)) recentTitlesByStudent.set(n.user_id, []);
    recentTitlesByStudent.get(n.user_id)!.push(n.title);
  }

  const pending = students.filter((s) => !submittedIds.has(s.id) && !reminderSentToday.has(s.id));

  let reminded = 0;
  for (const s of pending) {
    const prefs = (s.notif_prefs ?? {}) as Record<string, unknown>;
    if (prefs.daily_reminder === false) continue;

    const firstName = s.full_name.split(' ')[0];
    const dreamCollege = ((s.dream_colleges as string[] | null)?.[0]) ?? null;
    const streak = streakMap.get(s.id) ?? 0;
    const { title, body } = pickNoLogVariant(firstName, dreamCollege, streak, recentTitlesByStudent.get(s.id) ?? []);

    await admin.from('notifications').insert({
      user_id: s.id, type: 'daily_reminder', title, body,
      data: { url: '/student/tracker' }, read: false, channel: 'in_app',
    });

    if (prefs.email !== false && s.email) await sendDailyReminder(s.email, firstName);
    if (prefs.push === true) await sendPushToUser(s.id, { title, body, url: '/student/tracker' });

    reminded++;
  }

  return NextResponse.json({ reminded, total: students.length, pendingCount: pending.length });
}

export { POST as GET };
