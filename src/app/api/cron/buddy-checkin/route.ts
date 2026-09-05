import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { withCronTracking } from '@/lib/cron-run-tracker';
import { getLogDateString } from '@/lib/streak-utils';
import { chunked } from '@/lib/cron-sweep';
import {
  consecutiveMissedDays,
  checkInEligibility,
  buildCheckInDraft,
  type CheckInFacts,
} from '@/lib/os/buddy-checkin';
import { CHECKIN_DRAFT_TTL_HOURS } from '@/lib/os/scale-config';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// 04:00 UTC = 09:30 AM IST — thirty minutes after the buddy brief (03:30 UTC),
// so the mentor opens the app to "2 students went quiet" AND the two ready-made
// messages in the same sitting, not as two unrelated pings.
//
// Founder, 10 Aug: when an assigned student misses their log, the next day a
// message should go from THE BUDDY'S OWN ID — "bhai kal log kyun nahi bhara,
// padhai sahi chal rahi hai?" — so the student feels a person noticed, not a
// system. He chose draft-and-one-tap over auto-send, which is the right call:
// a message from Shreya's ID that Shreya has never seen means the student
// replies into silence, and that damages trust more than sending nothing.
//
// So this cron never sends. It writes ONE row per quiet student into
// buddy_checkin_drafts, already worded from that student's real data. The
// mentor taps Send on /buddy/home and it goes out from their account, into the
// real chat thread, through the same code path as any other message.
//
// Sequencing with the 8 AM log-yesterday push is deliberate and matters: that
// push fires on ONE missed day and only to students who opened the app. This
// fires on TWO consecutive missed days. The app nudges first; the human follows
// only when the app's nudge did not work. Nobody gets both on the same morning
// for the same miss.
export async function GET(request: NextRequest) {
  if (!authorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Tracked so a failure is visible in cron_runs instead of silent.
  return withCronTracking('/api/cron/buddy-checkin', () => buddy_checkinRun());
}

async function buddy_checkinRun(): Promise<NextResponse> {
  const admin = createAdminClient();
  const now = new Date();
  const today = getLogDateString(now);
  // 30 days back covers the miss streak, the "streak at break" reconstruction
  // and the last-log facts in a single read.
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - 31 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const { data: students } = await admin
    .from('profiles')
    // profiles.current_streak is dead (0 for every student — nothing writes
    // it; the real streak lives in streak_data). It was selected here and
    // never read; selecting it invites the next reader to trust it.
    .select('id, full_name, buddy_id')
    .eq('role', 'student')
    .not('buddy_id', 'is', null)
    // PAID ONLY (founder, 10 Aug: "this is only our premium feature, don't
    // build this for free"). A mentor personally noticing you went quiet is
    // the product — it is a person's attention, not automation, and it is the
    // thing the subscription buys.
    //
    // Not redundant with buddy_id: measured 10 Aug, one assigned student had
    // is_premium = false, so "has a buddy" does NOT imply "is paying". Free
    // students reachable through Mentor Doors grants are excluded too — they
    // hold a capped 3-message trial, not a mentor.
    .eq('is_premium', true)
    // Demo AND test accounts are excluded here, which is a deliberate break
    // from log-yesterday-reminder (that one keeps test accounts in, because the
    // founder tests as a student and the push lands on his own phone).
    //
    // The cost falls differently here. A draft does not land on the fake
    // account — it lands as a card on a REAL mentor's home screen, asking a
    // real person to check in on someone who does not exist. Measured 10 Aug:
    // two of the five assigned students were test accounts, so without this
    // the feature's first impression on a mentor would have been noise.
    .not('is_demo', 'is', true)
    .not('is_test_account', 'is', true);

  if (!students?.length) {
    return NextResponse.json({ drafted: 0, reason: 'no_assigned_students' });
  }

  const ids = students.map((s) => s.id as string);

  // One read per chunk, not per student.
  const reports: { student_id: string; report_date: string; mock_taken: boolean | null; mock_name: string | null; blocker_reason: string | null }[] = [];
  const drafts: { student_id: string; sent_at: string | null; dismissed_at: string | null; expires_at: string; replied_at: string | null }[] = [];
  for (const chunk of chunked(ids)) {
    const [{ data: r }, { data: d }] = await Promise.all([
      admin
        .from('daily_reports')
        .select('student_id, report_date, mock_taken, mock_name, blocker_reason')
        .in('student_id', chunk)
        .gte('report_date', since),
      admin
        .from('buddy_checkin_drafts')
        .select('student_id, sent_at, dismissed_at, expires_at, replied_at')
        .in('student_id', chunk)
        .order('created_at', { ascending: false }),
    ]);
    reports.push(...((r ?? []) as typeof reports));
    drafts.push(...((d ?? []) as typeof drafts));
  }

  // Per-student log history, newest first.
  const byStudent = new Map<string, typeof reports>();
  for (const r of reports) {
    const list = byStudent.get(r.student_id) ?? [];
    list.push(r);
    byStudent.set(r.student_id, list);
  }
  for (const list of byStudent.values()) list.sort((a, b) => (a.report_date < b.report_date ? 1 : -1));

  const draftsByStudent = new Map<string, typeof drafts>();
  for (const d of drafts) {
    const list = draftsByStudent.get(d.student_id) ?? [];
    list.push(d);
    draftsByStudent.set(d.student_id, list);
  }

  // Pass 1 — who is eligible. Cheap, in memory, no extra reads.
  const candidates: { student: (typeof students)[number]; missedDays: number }[] = [];
  const skipped: Record<string, number> = {};
  for (const s of students) {
    const history = byStudent.get(s.id as string) ?? [];
    const missedDays = consecutiveMissedDays(history.map((r) => r.report_date), today);

    const mine = draftsByStudent.get(s.id as string) ?? [];
    const hasOpenDraft = mine.some(
      (d) => !d.sent_at && !d.dismissed_at && Date.parse(d.expires_at) > now.getTime()
    );
    const sent = mine.filter((d) => d.sent_at);
    // Newest-first, so the unanswered run is the leading prefix.
    let unanswered = 0;
    for (const d of sent) {
      if (d.replied_at) break;
      unanswered++;
    }

    const verdict = checkInEligibility({
      missedDays,
      lastCheckInSentAt: sent[0]?.sent_at ?? null,
      unansweredCheckIns: unanswered,
      hasOpenDraft,
      now,
    });
    if (!verdict.eligible) {
      skipped[verdict.reason] = (skipped[verdict.reason] ?? 0) + 1;
      continue;
    }
    candidates.push({ student: s, missedDays });
  }

  if (!candidates.length) {
    return NextResponse.json({ drafted: 0, candidates: 0, skipped });
  }

  // Pass 2 — the cold-section signal, read ONLY for candidates. At any scale
  // this set is small (it is "students who went quiet today"), which is why the
  // expensive per-student read is deliberately not in pass 1.
  const candidateIds = candidates.map((c) => c.student.id as string);
  const coverage: { student_id: string; section: string; updated_at: string }[] = [];
  for (const chunk of chunked(candidateIds)) {
    const { data } = await admin
      .from('topic_coverage')
      .select('student_id, section, updated_at')
      .in('student_id', chunk)
      .eq('is_priority', true);
    coverage.push(...((data ?? []) as typeof coverage));
  }
  // Most recent touch per (student, section) — the coldest one is the signal.
  const lastTouch = new Map<string, Map<string, number>>();
  for (const c of coverage) {
    const perSection = lastTouch.get(c.student_id) ?? new Map<string, number>();
    const at = Date.parse(c.updated_at);
    if (at > (perSection.get(c.section) ?? 0)) perSection.set(c.section, at);
    lastTouch.set(c.student_id, perSection);
  }

  const expiresAt = new Date(now.getTime() + CHECKIN_DRAFT_TTL_HOURS * 3_600_000).toISOString();
  const rows: Record<string, unknown>[] = [];

  for (const { student, missedDays } of candidates) {
    const history = byStudent.get(student.id as string) ?? [];
    const lastLog = history[0] ?? null;

    let coldSection: CheckInFacts['coldSection'] = null;
    const perSection = lastTouch.get(student.id as string);
    if (perSection?.size) {
      let coldest: { section: string; days: number } | null = null;
      for (const [section, at] of perSection) {
        const days = Math.floor((now.getTime() - at) / 86_400_000);
        if (!coldest || days > coldest.days) coldest = { section, days };
      }
      coldSection = coldest;
    }

    const draft = buildCheckInDraft({
      firstName: ((student.full_name as string | null) ?? '').split(' ')[0] ?? '',
      missedDays,
      // current_streak is recomputed from full history by date, so once the
      // student goes quiet it has already fallen to 0 — the streak they LOST is
      // the run of logged days immediately before the silence.
      streakAtBreak: streakBeforeBreak(history.map((r) => r.report_date), today, missedDays),
      lastLogHadMock: !!lastLog?.mock_taken,
      lastMockName: lastLog?.mock_name ?? null,
      lastBlocker: lastLog?.blocker_reason ?? null,
      coldSection,
    });

    rows.push({
      buddy_id: student.buddy_id,
      student_id: student.id,
      draft_body: draft.body,
      signal: draft.signal,
      evidence: draft.evidence,
      missed_days: missedDays,
      expires_at: expiresAt,
    });
  }

  // The partial unique index makes a duplicate open draft impossible; ignoring
  // the conflict means a re-run is a no-op rather than a 409.
  let drafted = 0;
  for (const chunk of chunked(rows, 100)) {
    const { data, error } = await admin
      .from('buddy_checkin_drafts')
      .upsert(chunk, { onConflict: 'student_id', ignoreDuplicates: true })
      .select('id');
    if (error) return NextResponse.json({ error: error.message, drafted }, { status: 500 });
    drafted += data?.length ?? 0;
  }

  return NextResponse.json({ drafted, candidates: candidates.length, skipped });
}

/**
 * The run of consecutive logged days immediately before the silence started.
 *
 * Not the same as `profiles.current_streak`: that is recomputed from history by
 * date, so a student who has been quiet for two days already reads 0 there. To
 * say "tumne 14 din ka streak banaya tha" we have to look back past the gap.
 */
function streakBeforeBreak(logDates: string[], today: string, missedDays: number): number {
  const logged = new Set(logDates);
  let cursor = Date.parse(`${today}T00:00:00Z`) - (missedDays + 1) * 86_400_000;
  let run = 0;
  while (run < 400) {
    const day = new Date(cursor).toISOString().slice(0, 10);
    if (!logged.has(day)) break;
    run++;
    cursor -= 86_400_000;
  }
  return run;
}

export { GET as POST };
