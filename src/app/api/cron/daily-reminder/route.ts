import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendDailyReminder } from '@/lib/email';
import { sendPushToUser } from '@/lib/push';
import { pickNotification, type NotifBucket } from '@/lib/notification-engine';

// Called by Vercel Cron at 14:30 UTC = 8:00 PM IST every day
export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const todayStart = new Date().toISOString().split('T')[0] + 'T00:00:00+05:30';
  const since24h = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const since7d = new Date(Date.now() - 7 * 86_400_000).toISOString().split('T')[0];

  // Fetch all active students with dream_colleges
  const { data: students } = await admin
    .from('profiles')
    .select('id, full_name, email, notif_prefs, dream_colleges')
    .eq('role', 'student')
    .eq('subscription_status', 'free_beta');
  if (!students?.length) return NextResponse.json({ reminded: 0 });

  const studentIds = students.map((s) => s.id);

  // Find who hasn't logged today
  const { data: todayReports } = await admin
    .from('daily_reports')
    .select('student_id')
    .in('student_id', studentIds)
    .eq('report_date', today);
  const submittedIds = new Set((todayReports ?? []).map((r) => r.student_id));

  // Get streak data for all students
  const { data: streakRows } = await admin
    .from('streak_data')
    .select('student_id, current_streak')
    .in('student_id', studentIds);
  const streakMap = new Map<string, number>(
    (streakRows ?? []).map((r) => [r.student_id, r.current_streak ?? 0])
  );

  // Days missed (last 7 days — how many had no report)
  const { data: recentReports } = await admin
    .from('daily_reports')
    .select('student_id, report_date')
    .in('student_id', studentIds)
    .gte('report_date', since7d);
  const reportDaysByStudent = new Map<string, Set<string>>();
  for (const r of recentReports ?? []) {
    if (!reportDaysByStudent.has(r.student_id)) reportDaysByStudent.set(r.student_id, new Set());
    reportDaysByStudent.get(r.student_id)!.add(r.report_date);
  }

  // Recent notification history per student (for variety engine)
  const { data: recentNotifs } = await admin
    .from('notifications')
    .select('user_id, body, type, created_at')
    .in('user_id', studentIds)
    .in('type', ['daily_reminder', 'buddy_ping'])
    .gte('created_at', new Date(Date.now() - 10 * 86_400_000).toISOString())
    .order('created_at', { ascending: false });

  // Group by student
  const notifsByStudent = new Map<string, typeof recentNotifs>();
  for (const n of recentNotifs ?? []) {
    if (!notifsByStudent.has(n.user_id)) notifsByStudent.set(n.user_id, []);
    notifsByStudent.get(n.user_id)!.push(n);
  }

  const pending = students.filter((s) => !submittedIds.has(s.id));

  let reminded = 0;
  for (const s of pending) {
    const prefs = (s.notif_prefs ?? {}) as Record<string, unknown>;
    if (prefs.daily_reminder === false) continue;

    const firstName = s.full_name.split(' ')[0];
    const dreamCollege = ((s.dream_colleges as string[] | null)?.[0]) ?? null;
    const streak = streakMap.get(s.id) ?? 0;
    const reportDays = reportDaysByStudent.get(s.id) ?? new Set();
    const daysMissed = 7 - reportDays.size; // approximate

    const studentNotifs = notifsByStudent.get(s.id) ?? [];
    const todayNotifs = studentNotifs.filter((n) => n.created_at >= todayStart);
    const recentBodies = studentNotifs.slice(0, 10).map((n) => n.body);
    const lastBucket = (studentNotifs[0]?.type as NotifBucket | null) ?? null;

    const result = pickNotification({
      name: firstName,
      dreamCollege,
      streak,
      daysMissed,
      hasWin: false, // wins handled separately
      lastBucket,
      recentBodies,
      dailySendCount: todayNotifs.length,
      dailyCap: 2,
    });

    if (result.capped) continue;

    // In-app notification (always)
    await admin.from('notifications').insert({
      user_id: s.id,
      type: 'daily_reminder',
      title: result.title,
      body: result.body,
      data: { url: '/student/tracker', bucket: result.bucket },
      read: false,
      channel: 'in_app',
    });

    // Email
    if (prefs.email !== false && s.email) {
      await sendDailyReminder(s.email, firstName);
    }

    // Push
    if (prefs.push === true) {
      await sendPushToUser(s.id, {
        title: result.title,
        body: result.body,
        url: '/student/tracker',
      });
    }

    reminded++;
  }

  return NextResponse.json({ reminded, total: students.length, pendingCount: pending.length });
}

export { POST as GET };
