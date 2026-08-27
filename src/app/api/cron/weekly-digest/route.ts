import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { dispatch } from '@/lib/notification-os';
import { computeSummary } from '@/lib/analytics';
import { sendBuddyWeeklyDigest } from '@/lib/email';
import { authorizedCron } from '@/lib/cron-auth';
import { withCronTracking } from '@/lib/cron-run-tracker';
import { readRows, isUnavailable, type Source } from '@/lib/truth/source';
import { readRowsForIds } from '@/lib/truth/batch';

// ── B3b #6 — read safety ONLY ──────────────────────────────────────────────
//
// READ → DERIVED VALUE → DECISION → SIDE EFFECT:
//
//   profiles(buddies)  → recipients        → who gets a digest  → gates all
//   profiles(students) → studentsByBuddy   → whose scores       → the roster
//   daily_reports      → computeSummary()  → score + band +
//                                            redFlags PER NAMED
//                                            STUDENT             → in-app row AND
//                                                                  EMAIL to mentor
//
// This is the strongest false-claim case in the whole migration. A failed
// `daily_reports` read gave every student `reps = []`, and computeSummary on an
// empty week yields a bottom-band score plus "Fewer than 4 reports this week".
// The mentor then received, by EMAIL, a per-student line of the form
//
//     Priya: 25/100 (Needs intervention) • Arjun: 25/100 (Needs intervention) …
//
// for their entire roster. Named students, numeric scores, delivered outside
// the product where it cannot be corrected — all from one dead query.
type DigestBuddy = { id: string; full_name: string; email: string | null; notif_prefs?: unknown };
type DigestStudent = { id: string; full_name: string; buddy_id: string | null };
// Mirrors the SELECT. `DailyReport` carries columns this query does not ask
// for, so naming it as the row type makes the generic disagree with what
// PostgREST returns — the same mismatch check-red-flags hit.
type DigestReportRow = Pick<DailyReport,
  'student_id' | 'report_date' | 'study_duration' | 'confidence' | 'stress' |
  'sleep_quality' | 'overall_energy' | 'mock_taken' | 'total_accuracy'>;

function digestSourceDead(reason: string) {
  console.error('[weekly-digest] source unavailable — no digest was sent', reason);
  return NextResponse.json(
    { ok: false, skipped: 'source_unavailable', reason, sent: 0 }, { status: 503 });
}
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

    const [buddiesSource, studentsSource] = await Promise.all([
      readRows<DigestBuddy>('profiles(buddies)', () =>
        admin.from('profiles').select('id, full_name, email, notif_prefs').eq('role', 'buddy')),
      readRows<DigestStudent>('profiles(students)', () =>
        admin.from('profiles').select('id, full_name, buddy_id').eq('role', 'student')),
    ]);
    if (isUnavailable(buddiesSource)) return digestSourceDead(`profiles(buddies): ${buddiesSource.reason}`);
    if (isUnavailable(studentsSource)) return digestSourceDead(`profiles(students): ${studentsSource.reason}`);
    const buddies = buddiesSource.state === 'value' ? buddiesSource.value : [];
    const allStudents = studentsSource.state === 'value' ? studentsSource.value : [];
    if (!buddies.length) return NextResponse.json({ ok: true, sent: 0 });

    const allStudentIds = allStudents.map((s) => s.id);
    const reportsSource = allStudentIds.length > 0
      ? await readRowsForIds<string, DigestReportRow>('daily_reports', allStudentIds, (chunk) =>
          admin.from('daily_reports')
            .select('student_id, report_date, study_duration, confidence, stress, sleep_quality, overall_energy, mock_taken, total_accuracy')
            .in('student_id', chunk)
            .gte('report_date', weekAgoStr))
      : ({ state: 'no_data' } as Source<DigestReportRow[]>);
    if (isUnavailable(reportsSource)) return digestSourceDead(`daily_reports: ${reportsSource.reason}`);
    const allReportsRaw = reportsSource.state === 'value' ? reportsSource.value : [];

    // Build O(1) lookup Maps
    const studentsByBuddy = new Map<string, Array<{ id: string; full_name: string }>>();
    for (const s of allStudents) {
      if (s.buddy_id) {
        if (!studentsByBuddy.has(s.buddy_id)) studentsByBuddy.set(s.buddy_id, []);
        studentsByBuddy.get(s.buddy_id)!.push({ id: s.id, full_name: s.full_name });
      }
    }
    const reportsByStudent = new Map<string, DailyReport[]>();
    for (const r of allReportsRaw) {
      const rr = r as unknown as DailyReport;
      if (!reportsByStudent.has(rr.student_id)) reportsByStudent.set(rr.student_id, []);
      reportsByStudent.get(rr.student_id)!.push(rr);
    }

    // ── One digest per buddy per week ────────────────────────────────────
    // Duplication sweep, 26 Aug: this job is scheduled TWICE at `0 4 * * 1` —
    // once in vercel.json and once in the GitHub cron fallback — and it had
    // NO dedup of any kind. weekly_digest is also absent from the
    // notifications_once_per_day_per_type index, so nothing downstream caught
    // it either: every mentor received two identical in-app rows and two
    // identical emails, every Monday. The constitution's key for this event is
    // (user, ISO week); a 6-day lookback is that key, expressed as a read the
    // second scheduler will lose.
    // FAIL CLOSED. A bare `const { data }` here would make an unreadable
    // dedup query look like "nobody has been digested", which is precisely
    // how the duplicate this guard exists to stop would come back — a
    // transient Postgres hiccup on either scheduler's run, and every mentor
    // gets two digests again. If we cannot prove who was already told, we
    // send to nobody this run; the next run re-reads and catches up.
    const weekAgo = new Date(Date.now() - 6 * 86_400_000).toISOString();
    const digestSource = await readRows<{ user_id: string }>('notifications(weekly dedup)', () =>
      admin.from('notifications').select('user_id').eq('type', 'weekly_digest').gte('created_at', weekAgo));
    if (isUnavailable(digestSource)) {
      return NextResponse.json(
        { ok: false, reason: 'dedup_unavailable', detail: digestSource.reason,
          note: 'Refused rather than risk a second digest for every mentor.' },
        { status: 503 },
      );
    }
    const digestedThisWeek = new Set(
      (digestSource.state === 'value' ? digestSource.value : []).map((r) => r.user_id));

    // Process all buddies concurrently instead of sequentially
    const results = await Promise.all(buddies.map(async buddy => {
      if (digestedThisWeek.has(buddy.id)) return false;
      const myStudents = studentsByBuddy.get(buddy.id) ?? [];
      if (!myStudents.length) return false;

      const summaries = myStudents.map(s => {
        const reps = reportsByStudent.get(s.id) ?? [];
        const summary = computeSummary(reps, 7);
        return { name: s.full_name, score: summary.overallScore, band: summary.band, redFlags: summary.redFlags };
      });

      const digestBody = summaries.map(s => `${s.name}: ${s.score}/100 (${s.band})`).join(' • ');
      // ONE event, two channels. This used to be an in-app row AND a separate
      // email with no shared identity — two records of one weekly digest, and
      // no way to ask "did the digest reach this buddy?". dispatch() writes a
      // single row and stamps emailed_at on it when the email leg succeeds.
      await dispatch({
        userId: buddy.id,
        type: 'weekly_digest',
        title: 'Weekly digest — your students',
        body: digestBody,
        url: '/buddy/home',
        data: { summaries },
        reason: 'Weekly roster digest — the buddy\'s one scheduled read of their students',
        expectedAction: 'acknowledge',
        prefs: (buddy.notif_prefs as Record<string, unknown>) ?? {},
        email: buddy.email
          ? { to: buddy.email, send: () => sendBuddyWeeklyDigest(buddy.email!, buddy.full_name.split(' ')[0], summaries) }
          : null,
      });
      return true;
    }));

    return NextResponse.json({ ok: true, sent: results.filter(Boolean).length, buddies: buddies.length });
  });
}

export { POST as GET };
