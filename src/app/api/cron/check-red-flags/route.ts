import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeSummary } from '@/lib/analytics';
import { sendRedFlagAlert } from '@/lib/email';
import { authorizedCron } from '@/lib/cron-auth';
import type { DailyReport } from '@/types';

// Called after each report submission or by cron to detect red flags
export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  const { data: students } = await admin.from('profiles').select('id, full_name, buddy_id').eq('role', 'student');
  if (!students?.length) return NextResponse.json({ flagged: 0 });

  const studentIds = students.map(s => s.id);
  const { data: reports } = await admin.from('daily_reports').select('*').in('student_id', studentIds).gte('report_date', weekAgoStr);
  const allReports = (reports ?? []) as DailyReport[];

  let flagged = 0;
  for (const student of students) {
    if (!student.buddy_id) continue;
    const reps = allReports.filter(r => r.student_id === student.id);
    const summary = computeSummary(reps, 7);
    if (summary.redFlags.length === 0) continue;

    // Check if we already sent a flag alert in last 24h
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const { data: recentAlert } = await admin
      .from('notifications')
      .select('id')
      .eq('user_id', student.buddy_id)
      .eq('type', 'red_flag')
      .contains('data', { student_id: student.id })
      .gte('created_at', yesterday.toISOString())
      .single();

    if (recentAlert) continue; // Already alerted today

    const { data: buddy } = await admin.from('profiles').select('full_name, email').eq('id', student.buddy_id).single();
    if (!buddy) continue;

    // In-app alert to buddy
    await admin.from('notifications').insert({
      user_id: student.buddy_id,
      type: 'red_flag',
      title: `⚠️ Red flag: ${student.full_name}`,
      body: summary.redFlags[0],
      data: { student_id: student.id, flags: summary.redFlags },
      read: false,
      channel: 'in_app',
    });

    // Email alert
    if (buddy.email) {
      await sendRedFlagAlert(buddy.email, buddy.full_name.split(' ')[0], student.full_name, summary.redFlags);
    }

    flagged++;
  }

  return NextResponse.json({ flagged });
}

export { POST as GET };
