import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendDailyReminder } from '@/lib/email';
import { sendPushToUser } from '@/lib/push';
import { pickNoLogVariant, onboardingCopy } from '@/lib/notification-engine';
import { authorizedCron } from '@/lib/cron-auth';

// Called by Vercel Cron at 14:30 UTC = 8:00 PM IST every day.
export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const todayStart = new Date(today + 'T00:00:00+05:30').toISOString();

  const { data: students } = await admin
    .from('profiles')
    .select('id, full_name, email, notif_prefs, dream_colleges, created_at')
    .eq('role', 'student');
  if (!students?.length) return NextResponse.json({ reminded: 0 });

  const studentIds = students.map((s) => s.id);

  const [
    { data: todayReports },
    { data: allReports },
    { data: streakRows },
    { data: recentNotifs },
    { data: todayNotifs },
  ] = await Promise.all([
    admin.from('daily_reports').select('student_id').in('student_id', studentIds).eq('report_date', today),
    admin.from('daily_reports').select('student_id, report_date').in('student_id', studentIds),
    admin.from('streak_data').select('student_id, current_streak').in('student_id', studentIds),
    admin.from('notifications').select('user_id, title').in('user_id', studentIds).eq('type', 'daily_reminder')
      .gte('created_at', new Date(Date.now() - 10 * 86_400_000).toISOString()).order('created_at', { ascending: false }),
    admin.from('notifications').select('user_id').in('user_id', studentIds).in('type', ['daily_reminder', 'onboarding_evening']).gte('created_at', todayStart),
  ]);

  const submittedIds = new Set((todayReports ?? []).map((r) => r.student_id));
  const streakMap = new Map((streakRows ?? []).map((r) => [r.student_id, r.current_streak ?? 0]));
  const reminderSentToday = new Set((todayNotifs ?? []).map((n) => n.user_id));

  // First-7-days students get the day-by-day onboarding arc instead of the
  // generic rotation — this is the second (evening) of their two daily touches.
  const loggedDaysByStudent = new Map<string, Set<string>>();
  for (const r of allReports ?? []) {
    if (!loggedDaysByStudent.has(r.student_id)) loggedDaysByStudent.set(r.student_id, new Set());
    loggedDaysByStudent.get(r.student_id)!.add(r.report_date);
  }
  const fourteenDaysAgoMs = Date.now() - 14 * 86_400_000;

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

    const loggedDays = loggedDaysByStudent.get(s.id) ?? new Set();
    const isOnboarding = loggedDays.size < 7 && new Date(s.created_at).getTime() >= fourteenDaysAgoMs;
    const onboarding = isOnboarding ? onboardingCopy(loggedDays.size + 1, 'pending', firstName) : null;

    const { title, body } = onboarding ?? pickNoLogVariant(firstName, dreamCollege, streak, recentTitlesByStudent.get(s.id) ?? []);
    const notifType = onboarding ? 'onboarding_evening' : 'daily_reminder';

    await admin.from('notifications').insert({
      user_id: s.id, type: notifType, title, body,
      data: { url: '/student/tracker' }, read: false, channel: 'in_app',
    });

    if (prefs.email !== false && s.email) await sendDailyReminder(s.email, firstName);
    if (prefs.push === true) await sendPushToUser(s.id, { title, body, url: '/student/tracker' });

    reminded++;
  }

  return NextResponse.json({ reminded, total: students.length, pendingCount: pending.length });
}

export { POST as GET };
