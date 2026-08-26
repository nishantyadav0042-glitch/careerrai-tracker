import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { dispatch } from '@/lib/notification-os';
import { computeSummary } from '@/lib/analytics';
import { sendRedFlagAlert } from '@/lib/email';
import { authorizedCron } from '@/lib/cron-auth';
import { withCronTracking } from '@/lib/cron-run-tracker';
import type { DailyReport } from '@/types';
import { trailingWindow } from '@/lib/facts/window';
import { getLogDateString } from '@/lib/streak-utils';
import { readRows, isUnavailable } from '@/lib/truth/source';
import { readRowsForIds } from '@/lib/truth/batch';
import { gateOnSource } from '@/lib/truth/mutation-gate';

// Every invocation of this route walks the whole student roster. Vercel's
// default ceiling was never a decision anyone made here — it was simply
// inherited, and when it is reached the invocation is killed mid-loop and the
// students at the END of the ordering are silently never processed. Same
// students, every day, invisibly. 300s is declared so the ceiling is a choice,
// and lib/cron-sweep keeps the walk inside it.
export const maxDuration = 300;

// ── B3b migration #1 — the canary ──────────────────────────────────────────
//
// This job was the same shape as weekly-plan-reconcile and a strictly worse
// failure. That job moved dates on a failed read; this one MESSAGES PEOPLE.
//
//     if (reports.length < 4 && period === 7)
//       redFlags.push('Fewer than 4 reports this week — going quiet')
//
// `reports ?? []` on a failed read gives every student zero reports, so that
// line fires for EVERY student with a buddy. One dead query and every mentor
// receives an in-app alert and an email saying their student has gone quiet.
// Nothing in the old code could tell that apart from a genuinely quiet week,
// and the job would have returned `{ flagged: N }` looking like a normal day.
//
// THE BOUNDARY THIS NOW ENFORCES (founder ruling, 23 Aug — wider than "no DB
// write", because dispatch() makes a path mutation-capable with no SQL in it):
//
//     UNAVAILABLE → NO DECISION → no DB mutation
//                                 no notification
//                                 no email
//                                 no student-facing claim
//
// Every read below is one of: bounded-and-gated, or fails closed. There is no
// path on which an unavailable read produces a side effect.

interface StudentRow { id: string; full_name: string; buddy_id: string | null }
interface BuddyRow { id: string; full_name: string; email: string | null }
// Mirrors the SELECT exactly. `DailyReport` carries columns this query does not
// ask for, so naming it as the row type here would make the generic disagree
// with what PostgREST actually returns.
type ReportRow = Pick<DailyReport,
  'student_id' | 'report_date' | 'study_duration' | 'confidence' | 'stress' |
  'sleep_quality' | 'overall_energy' | 'mock_taken' | 'total_accuracy'>;

export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return withCronTracking('/api/cron/check-red-flags', async () => {

    const admin = createAdminClient();
    // 0C.3 Wave 1: the window comes from the authority, and the day key is the
    // 05:30-IST study day rather than an IST calendar date.
    const weekAgoStr = trailingWindow(getLogDateString()).start;

    // ── Read 1: the roster ────────────────────────────────────────────────
    // Was `{ data: students }` with no error check. An unavailable roster then
    // fell through `!students?.length` and the job answered `{ flagged: 0 }` —
    // indistinguishable from "nobody is at risk today".
    const studentsSource = await readRows<StudentRow>('profiles(students)', () =>
      admin.from('profiles').select('id, full_name, buddy_id').eq('role', 'student'));
    if (isUnavailable(studentsSource)) {
      console.error('[check-red-flags] roster unavailable — nobody was flagged, nobody was emailed',
        studentsSource.reason);
      return NextResponse.json(
        { ok: false, skipped: 'source_unavailable', reason: studentsSource.reason, flagged: 0 },
        { status: 503 });
    }
    const students: StudentRow[] = studentsSource.state === 'value' ? studentsSource.value : [];
    if (students.length === 0) return NextResponse.json({ ok: true, flagged: 0, examined: 0 });

    // ── Read 2: the incident shape ────────────────────────────────────────
    // Was `.in('student_id', studentIds)` for the entire cohort in one request
    // — 739 ids on 23 Aug — with `reports ?? []` swallowing the failure.
    // Chunked now, so request size is bounded by CHUNK and not by how many
    // students CareerRai has, and all-or-nothing across chunks: a partial read
    // is UNAVAILABLE, never a partial answer.
    const studentIds = students.map((s) => s.id);
    const reportsSource = await readRowsForIds<string, ReportRow>(
      'daily_reports', studentIds,
      (chunk) => admin.from('daily_reports')
        .select('student_id, report_date, study_duration, confidence, stress, sleep_quality, overall_energy, mock_taken, total_accuracy')
        .in('student_id', chunk)
        .gte('report_date', weekAgoStr));

    const gate = gateOnSource(reportsSource);
    if (!gate.proceed) {
      // The whole point. No summary is computed, so no red flag exists, so no
      // notification row is inserted and no email is sent.
      console.error('[check-red-flags] daily_reports unavailable — no alert was raised for any student',
        gate.reason);
      return NextResponse.json(
        { ok: false, skipped: 'source_unavailable', reason: gate.reason, examined: students.length, flagged: 0 },
        { status: 503 });
    }
    const allReports = gate.data as DailyReport[];

    const reportsByStudentId = new Map<string, DailyReport[]>();
    for (const r of allReports) {
      if (!reportsByStudentId.has(r.student_id)) reportsByStudentId.set(r.student_id, []);
      reportsByStudentId.get(r.student_id)!.push(r);
    }

    // ── Read 3: buddy identities ──────────────────────────────────────────
    // Also population-scaled — it grows with the mentor base. Previously an
    // unavailable read left buddyById empty and every student fell out at
    // `if (!buddy)`, so the job under-alerted silently and still reported
    // success. Now it is bounded, and unavailability stops the run.
    const buddyIdsNeeded = [...new Set(students.filter((s) => s.buddy_id).map((s) => s.buddy_id!))];
    const buddyById = new Map<string, { full_name: string; email: string | null; notif_prefs: unknown }>();
    if (buddyIdsNeeded.length > 0) {
      const buddySource = await readRowsForIds<string, BuddyRow>(
        'profiles(buddies)', buddyIdsNeeded,
        (chunk) => admin.from('profiles').select('id, full_name, email, notif_prefs').in('id', chunk));
      if (isUnavailable(buddySource)) {
        console.error('[check-red-flags] buddy profiles unavailable — no alert was raised',
          buddySource.reason);
        return NextResponse.json(
          { ok: false, skipped: 'source_unavailable', reason: buddySource.reason, examined: students.length, flagged: 0 },
          { status: 503 });
      }
      const buddyProfiles: BuddyRow[] = buddySource.state === 'value' ? buddySource.value : [];
      for (const b of buddyProfiles) buddyById.set(b.id, { full_name: b.full_name, email: b.email, notif_prefs: (b as { notif_prefs?: unknown }).notif_prefs });
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayIso = yesterday.toISOString();

    let dedupUnavailable = 0;

    const results = await Promise.all(students.map(async (student) => {
      if (!student.buddy_id) return false;
      const reps = reportsByStudentId.get(student.id) ?? [];
      const summary = computeSummary(reps, 7);
      if (summary.redFlags.length === 0) return false;

      // ── Read 4: the dedup check, and it FAILED OPEN ────────────────────
      // Was `{ data: recentAlert }` with no error check. An unavailable read
      // made `recentAlert` null, which reads as "no alert sent recently" — so a
      // broken dedup query produced a DUPLICATE alert rather than none. That is
      // an unavailable read manufacturing a side effect, which is precisely
      // backwards. It now fails CLOSED: if we cannot prove we have not already
      // told this mentor, we do not tell them again.
      const recentSource = await readRows<{ id: string }>('notifications(dedup)', () =>
        admin.from('notifications').select('id')
          .eq('user_id', student.buddy_id!)
          .eq('type', 'red_flag')
          .contains('data', { student_id: student.id })
          .gte('created_at', yesterdayIso)
          .limit(1));
      if (isUnavailable(recentSource)) {
        dedupUnavailable++;
        return false;
      }
      if (recentSource.state === 'value' && recentSource.value.length > 0) return false;

      const buddy = buddyById.get(student.buddy_id);
      if (!buddy) return false;

      // Through dispatch(). The fail-closed dedup above is unchanged — it
      // reads data->>student_id, which dispatch carries through as-is.
      await dispatch({
        userId: student.buddy_id,
        type: 'red_flag',
        title: `⚠️ Red flag: ${student.full_name}`,
        body: summary.redFlags[0],
        url: `/buddy/students/${student.id}`,
        data: { student_id: student.id, flags: summary.redFlags },
        reason: 'A student is showing red flags their buddy has not been told about',
        expectedAction: 'acknowledge',
        prefs: (buddy.notif_prefs as Record<string, unknown>) ?? {},
      });

      if (buddy.email) {
        await sendRedFlagAlert(buddy.email, buddy.full_name.split(' ')[0], student.full_name, summary.redFlags);
      }

      return true;
    }));

    return NextResponse.json({
      ok: true,
      flagged: results.filter(Boolean).length,
      examined: students.length,
      // Surfaced rather than swallowed: a run that skipped students because it
      // could not check for duplicates is PARTIAL-DEGRADED, not SUCCESS, and
      // cron_runs now records enough to say so.
      skipped_dedup_unavailable: dedupUnavailable,
    });
  });
}

export { POST as GET };
