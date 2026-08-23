import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeSummary } from '@/lib/analytics';
import { sendBuddyWeeklyDigest } from '@/lib/email';
import { authorizedCron } from '@/lib/cron-auth';
import { withCronTracking } from '@/lib/cron-run-tracker';
import type { DailyReport } from '@/types';
import { trailingWindow } from '@/lib/facts/window';
import { getLogDateString } from '@/lib/streak-utils';

// Every invocation of this route walks the whole student roster. Vercel's
// default ceiling was never a decision anyone made here — it was simply
// inherited, and when it is reached the invocation is killed mid-loop and the
// students at the END of the ordering are silently never processed. Same
// students, every day, invisibly. 300s is declared so the ceiling is a choice,
// and lib/cron-sweep keeps the walk inside it.
export const maxDuration = 300;

// Called by Vercel Cron at 04:00 UTC = 9:30 AM IST every Monday
export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return withCronTracking('/api/cron/weekly-digest', async () => {

    const admin = createAdminClient();

    // 0C.3 Wave 1. Was `now − 7d`, i.e. an EIGHT-day inclusive window feeding a
    // `daysSubmitted` that is rendered as "N/7". The window now comes from the
    // authority; the day key comes from the 05:30-IST study day rather than an
    // IST calendar date, which disagreed with it between 00:00 and 05:30.
    //
    // The BATCH READ itself is deliberately untouched — an unchecked
    // `.in(student_id, …)` over the whole cohort is the weekly-plan-reconcile
    // shape, and that migration is B3b, gated on cron telemetry.
    const weekAgoStr = trailingWindow(getLogDateString()).start;

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
  });
}

export { POST as GET };
