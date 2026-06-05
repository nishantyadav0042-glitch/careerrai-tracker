import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendDailyReminder } from '@/lib/email';
import { sendPushToUser } from '@/lib/push';

// Called by Vercel Cron at 14:30 UTC = 8:00 PM IST every day
export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  // Get all students
  const { data: students } = await admin.from('profiles').select('id, full_name, email, notif_prefs').eq('role', 'student');
  if (!students?.length) return NextResponse.json({ reminded: 0 });

  // Find students who haven't submitted today
  const studentIds = students.map(s => s.id);
  const { data: todayReports } = await admin.from('daily_reports').select('student_id').in('student_id', studentIds).eq('report_date', today);
  const submittedIds = new Set((todayReports ?? []).map(r => r.student_id));

  const pending = students.filter(s => !submittedIds.has(s.id));

  let reminded = 0;
  for (const s of pending) {
    const prefs = s.notif_prefs ?? {};

    // In-app notification
    await admin.from('notifications').insert({
      user_id: s.id,
      type: 'daily_reminder',
      title: "Don't break your streak today 🔥",
      body: "Your daily report is pending. Takes 90 seconds — fill it now.",
      data: {},
      read: false,
      channel: 'in_app',
    });

    // Email
    if (prefs.email !== false && s.email) {
      await sendDailyReminder(s.email, s.full_name.split(' ')[0]);
    }

    // Push
    if (prefs.push === true) {
      await sendPushToUser(s.id, {
        title: "CareerRai: Report pending 📋",
        body: `Hey ${s.full_name.split(' ')[0]}, fill today's report — 90 seconds.`,
        url: '/student/today',
      });
    }

    reminded++;
  }

  return NextResponse.json({ reminded, total: students.length, pendingCount: pending.length });
}

// Allow Vercel cron to call via GET too
export { POST as GET };
