import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendDailyReminder } from '@/lib/email';
import { sendPushToUser } from '@/lib/push';
import { onboardingCopy } from '@/lib/notification-engine';
import { authorizedCron } from '@/lib/cron-auth';

// PARTIALLY RETIRED. The two-regime split from the founder's notification
// philosophy: Day 0-7 keeps its scheduled, light evening touch (real habit-
// formation research, not a nag — see onboardingCopy); the generic
// post-day-7 guilt rotation (pickNoLogVariant — "Streak TOOT jayegi" and
// its siblings) is retired in favor of /api/cron/decision-engine's
// silence-capable model. This cron now only ever sends the onboarding arc.
export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const todayStart = new Date(today + 'T00:00:00+05:30').toISOString();

  // Only students still inside the first-7-days arc are candidates now —
  // the generic post-day-7 rotation is retired, so there's no reason to
  // fetch the full student roster or streak/title-recency data anymore.
  const fourteenDaysAgoIso = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const { data: students } = await admin
    .from('profiles')
    .select('id, full_name, email, notif_prefs, created_at')
    .eq('role', 'student')
    .gte('created_at', fourteenDaysAgoIso);
  if (!students?.length) return NextResponse.json({ reminded: 0 });

  const studentIds = students.map((s) => s.id);

  const [
    { data: todayReports },
    { data: allReports },
    { data: todayNotifs },
  ] = await Promise.all([
    admin.from('daily_reports').select('student_id').in('student_id', studentIds).eq('report_date', today),
    admin.from('daily_reports').select('student_id, report_date').in('student_id', studentIds),
    admin.from('notifications').select('user_id').in('user_id', studentIds).in('type', ['daily_reminder', 'onboarding_evening']).gte('created_at', todayStart),
  ]);

  const submittedIds = new Set((todayReports ?? []).map((r) => r.student_id));
  const reminderSentToday = new Set((todayNotifs ?? []).map((n) => n.user_id));

  const loggedDaysByStudent = new Map<string, Set<string>>();
  for (const r of allReports ?? []) {
    if (!loggedDaysByStudent.has(r.student_id)) loggedDaysByStudent.set(r.student_id, new Set());
    loggedDaysByStudent.get(r.student_id)!.add(r.report_date);
  }
  const fourteenDaysAgoMs = Date.now() - 14 * 86_400_000;

  const pending = students.filter((s) => !submittedIds.has(s.id) && !reminderSentToday.has(s.id));

  let reminded = 0;
  for (const s of pending) {
    const prefs = (s.notif_prefs ?? {}) as Record<string, unknown>;
    if (prefs.daily_reminder === false) continue;

    const firstName = s.full_name.split(' ')[0];
    const loggedDays = loggedDaysByStudent.get(s.id) ?? new Set();
    const isOnboarding = loggedDays.size < 7 && new Date(s.created_at).getTime() >= fourteenDaysAgoMs;
    if (!isOnboarding) continue; // generic guilt rotation retired — decision-engine owns day 8+

    const onboarding = onboardingCopy(loggedDays.size + 1, 'pending', firstName)!;
    const { title, body } = onboarding;

    await admin.from('notifications').insert({
      user_id: s.id, type: 'onboarding_evening', title, body,
      data: { url: '/student/tracker' }, read: false, channel: 'in_app',
    });

    if (prefs.email !== false && s.email) await sendDailyReminder(s.email, firstName);
    if (prefs.push === true) await sendPushToUser(s.id, { title, body, url: '/student/tracker' });

    reminded++;
  }

  return NextResponse.json({ reminded, total: students.length, pendingCount: pending.length });
}

export { POST as GET };
