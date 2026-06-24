import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeSummary } from '@/lib/analytics';
import { sendBuddyWeeklyDigest } from '@/lib/email';
import { authorizedCron } from '@/lib/cron-auth';
import type { DailyReport } from '@/types';

// Called by Vercel Cron at 04:00 UTC = 9:30 AM IST every Monday
export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  // Batch fetch buddies and all students in parallel — eliminates N per-buddy profile queries
  const [{ data: buddies }, { data: allStudents }] = await Promise.all([
    admin.from('profiles').select('id, full_name, email').eq('role', 'buddy'),
    admin.from('profiles').select('id, full_name, buddy_id').eq('role', 'student'),
  ]);
  if (!buddies?.length) return NextResponse.json({ sent: 0 });

  // Batch fetch all reports for all students in one query
  const allStudentIds = (allStudents ?? []).map(s => s.id);
  const { data: allReportsRaw } = allStudentIds.length > 0
    ? await admin.from('daily_reports')
        .select('student_id, report_date, study_duration, confidence, stress, sleep_quality, overall_energy, mock_taken, total_accuracy')
        .in('student_id', allStudentIds)
        .gte('report_date', weekAgoStr)
    : { data: [] };

  // Build O(1) lookup Maps
  const studentsByBuddy = new Map<string, Array<{ id: string; full_name: string }>>();
  for (const s of allStudents ?? []) {
    if (s.buddy_id) {
      if (!studentsByBuddy.has(s.buddy_id)) studentsByBuddy.set(s.buddy_id, []);
      studentsByBuddy.get(s.buddy_id)!.push({ id: s.id, full_name: s.full_name });
    }
  }
  const reportsByStudent = new Map<string, DailyReport[]>();
  for (const r of allReportsRaw ?? []) {
    const rr = r as unknown as DailyReport;
    if (!reportsByStudent.has(rr.student_id)) reportsByStudent.set(rr.student_id, []);
    reportsByStudent.get(rr.student_id)!.push(rr);
  }

  // Process all buddies concurrently instead of sequentially
  const results = await Promise.all(buddies.map(async buddy => {
    const myStudents = studentsByBuddy.get(buddy.id) ?? [];
    if (!myStudents.length) return false;

    const summaries = myStudents.map(s => {
      const reps = reportsByStudent.get(s.id) ?? [];
      const summary = computeSummary(reps, 7);
      return { name: s.full_name, score: summary.overallScore, band: summary.band, redFlags: summary.redFlags };
    });

    const digestBody = summaries.map(s => `${s.name}: ${s.score}/100 (${s.band})`).join(' • ');
    await Promise.all([
      admin.from('notifications').insert({
        user_id: buddy.id,
        type: 'weekly_digest',
        title: 'Weekly digest — your students',
        body: digestBody,
        data: { summaries },
        read: false,
        channel: 'in_app',
      }),
      buddy.email
        ? sendBuddyWeeklyDigest(buddy.email, buddy.full_name.split(' ')[0], summaries)
        : Promise.resolve(),
    ]);
    return true;
  }));

  return NextResponse.json({ sent: results.filter(Boolean).length });
}

export { POST as GET };
