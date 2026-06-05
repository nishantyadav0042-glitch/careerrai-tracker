import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeSummary } from '@/lib/analytics';
import { sendBuddyWeeklyDigest } from '@/lib/email';
import type { DailyReport } from '@/types';

// Called by Vercel Cron at 04:00 UTC = 9:30 AM IST every Monday
export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: buddies } = await admin.from('profiles').select('id, full_name, email').eq('role', 'buddy');
  if (!buddies?.length) return NextResponse.json({ sent: 0 });

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  let sent = 0;
  for (const buddy of buddies) {
    const { data: myStudents } = await admin.from('profiles').select('id, full_name').eq('buddy_id', buddy.id).eq('role', 'student');
    if (!myStudents?.length) continue;

    const studentIds = myStudents.map(s => s.id);
    const { data: reports } = await admin.from('daily_reports').select('*').in('student_id', studentIds).gte('report_date', weekAgoStr);
    const allReports = (reports ?? []) as DailyReport[];

    const summaries = myStudents.map(s => {
      const reps = allReports.filter(r => r.student_id === s.id);
      const summary = computeSummary(reps, 7);
      return { name: s.full_name, score: summary.overallScore, band: summary.band, redFlags: summary.redFlags };
    });

    // In-app digest notification
    const digestBody = summaries.map(s => `${s.name}: ${s.score}/100 (${s.band})`).join(' • ');
    await admin.from('notifications').insert({
      user_id: buddy.id,
      type: 'weekly_digest',
      title: 'Weekly digest — your students',
      body: digestBody,
      data: { summaries },
      read: false,
      channel: 'in_app',
    });

    // Email digest
    if (buddy.email) {
      await sendBuddyWeeklyDigest(buddy.email, buddy.full_name.split(' ')[0], summaries);
    }

    sent++;
  }

  return NextResponse.json({ sent });
}

export { POST as GET };
