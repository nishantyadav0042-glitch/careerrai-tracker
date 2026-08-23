import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeSummary } from '@/lib/analytics';
import { sendRedFlagAlert } from '@/lib/email';
import { authorizedCron } from '@/lib/cron-auth';
import { withCronTracking } from '@/lib/cron-run-tracker';
import type { DailyReport } from '@/types';

// Every invocation of this route walks the whole student roster. Vercel's
// default ceiling was never a decision anyone made here — it was simply
// inherited, and when it is reached the invocation is killed mid-loop and the
// students at the END of the ordering are silently never processed. Same
// students, every day, invisibly. 300s is declared so the ceiling is a choice,
// and lib/cron-sweep keeps the walk inside it.
export const maxDuration = 300;

// Called after each report submission or by cron to detect red flags
export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return withCronTracking('/api/cron/check-red-flags', async () => {

    const admin = createAdminClient();
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    const { data: students } = await admin.from('profiles').select('id, full_name, buddy_id').eq('role', 'student');
    if (!students?.length) return NextResponse.json({ flagged: 0 });

    const studentIds = students.map(s => s.id);
    const { data: reports } = await admin.from('daily_reports').select('student_id, report_date, study_duration, confidence, stress, sleep_quality, overall_energy, mock_taken, total_accuracy').in('student_id', studentIds).gte('report_date', weekAgoStr);
    const allReports = (reports ?? []) as DailyReport[];

    // Pre-build reports Map and batch-fetch all buddy profiles — eliminates N per-student DB round-trips
    const reportsByStudentId = new Map<string, DailyReport[]>();
    for (const r of allReports) {
      if (!reportsByStudentId.has(r.student_id)) reportsByStudentId.set(r.student_id, []);
      reportsByStudentId.get(r.student_id)!.push(r);
    }

    const buddyIdsNeeded = [...new Set(students.filter(s => s.buddy_id).map(s => s.buddy_id!))];
    const buddyById = new Map<string, { full_name: string; email: string | null }>();
    if (buddyIdsNeeded.length > 0) {
      const { data: buddyProfiles } = await admin.from('profiles').select('id, full_name, email').in('id', buddyIdsNeeded);
      for (const b of buddyProfiles ?? []) buddyById.set(b.id, { full_name: b.full_name, email: b.email });
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayIso = yesterday.toISOString();

    // Process all students concurrently — dedup checks and inserts run in parallel
    const results = await Promise.all(students.map(async student => {
      if (!student.buddy_id) return false;
      const reps = reportsByStudentId.get(student.id) ?? [];
      const summary = computeSummary(reps, 7);
      if (summary.redFlags.length === 0) return false;

      const { data: recentAlert } = await admin
        .from('notifications')
        .select('id')
        .eq('user_id', student.buddy_id)
        .eq('type', 'red_flag')
        .contains('data', { student_id: student.id })
        .gte('created_at', yesterdayIso)
        .maybeSingle();

      if (recentAlert) return false;

      const buddy = buddyById.get(student.buddy_id);
      if (!buddy) return false;

      await admin.from('notifications').insert({
        user_id: student.buddy_id,
        type: 'red_flag',
        title: `⚠️ Red flag: ${student.full_name}`,
        body: summary.redFlags[0],
        data: { student_id: student.id, flags: summary.redFlags },
        read: false,
        channel: 'in_app',
      });

      if (buddy.email) {
        await sendRedFlagAlert(buddy.email, buddy.full_name.split(' ')[0], student.full_name, summary.redFlags);
      }

      return true;
    }));

    return NextResponse.json({ flagged: results.filter(Boolean).length });
  });
}

export { POST as GET };
