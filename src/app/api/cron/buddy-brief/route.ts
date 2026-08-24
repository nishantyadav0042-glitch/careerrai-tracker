import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { dispatch } from '@/lib/notification-os';
import { buddyBriefCopy } from '@/lib/notification-engine';
import { authorizedCron } from '@/lib/cron-auth';
import { withCronTracking } from '@/lib/cron-run-tracker';
import { readRows, isUnavailable, type Source } from '@/lib/truth/source';
import { readRowsForIds } from '@/lib/truth/batch';

// ── B3b #7 — read safety ONLY ──────────────────────────────────────────────
//
// READ → DERIVED VALUE → DECISION → SIDE EFFECT:
//
//   profiles(students) → byBuddy roster    → who is briefed    → gates all
//   daily_reports      → reportDates       → loggedYesterday
//                                             (A COUNT) and
//                                             atRisk (NAMES)   → the brief text
//   notifications      → already           → dedup             → duplicate push
//   profiles(buddies)  → notif_prefs       → send gate         → push or not
//
// The middle row is the reason this one matters. `reportDates` does not merely
// gate the send — it produces both numbers in the message:
//
//     buddyBriefCopy(loggedYesterday, roster.length, atRisk)
//
// A failed read left `reportDates` empty, so `loggedYesterday` was 0 and
// `atRisk` was EVERY STUDENT BY NAME. The mentor's 9am push then read
// "0 of 7 logged yesterday — at risk: Priya, Arjun, …" about a roster that may
// have logged perfectly. Named students, a count, and a risk claim, all
// manufactured by one dead query.
type BriefStudent = { id: string; full_name: string; buddy_id: string | null };
type BriefReport = { student_id: string; report_date: string };
type BriefSent = { user_id: string };
type BriefBuddy = { id: string; notif_prefs: unknown };

function briefSourceDead(reason: string, buddies: number) {
  console.error('[buddy-brief] source unavailable — no brief was sent', reason);
  return NextResponse.json(
    { ok: false, skipped: 'source_unavailable', reason, sent: 0, buddies }, { status: 503 });
}

// Every invocation of this route walks the whole student roster. Vercel's
// default ceiling was never a decision anyone made here — it was simply
// inherited, and when it is reached the invocation is killed mid-loop and the
// students at the END of the ordering are silently never processed. Same
// students, every day, invisibly. 300s is declared so the ceiling is a choice,
// and lib/cron-sweep keeps the walk inside it.
export const maxDuration = 300;

// 03:30 UTC = 09:00 IST. The buddy's ONE scheduled push of the day: who logged
// yesterday, who's going quiet. Buddies get few notifications by design — this
// brief plus event pushes (new message, mock submitted, session request) is the
// entire buddy-side surface. Sent only to buddies with at least one student.
export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return withCronTracking('/api/cron/buddy-brief', async () => buddyBriefRun());
}

async function buddyBriefRun(): Promise<NextResponse> {
  const admin = createAdminClient();
  const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const yesterday = new Date(new Date(todayIST + 'T00:00:00+05:30').getTime() - 86_400_000)
    .toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const todayStart = new Date(todayIST + 'T00:00:00+05:30').toISOString();

  const studentsSource = await readRows<BriefStudent>('profiles(students)', () =>
    admin
      .from('profiles')
      .select('id, full_name, buddy_id')
      .eq('role', 'student')
      .not('buddy_id', 'is', null));
  if (isUnavailable(studentsSource)) return briefSourceDead(`profiles(students): ${studentsSource.reason}`, 0);
  const students = studentsSource.state === 'value' ? studentsSource.value : [];
  if (!students.length) return NextResponse.json({ ok: true, sent: 0, reason: 'no_assigned_students' });

  const byBuddy = new Map<string, { id: string; name: string }[]>();
  for (const s of students) {
    if (!byBuddy.has(s.buddy_id!)) byBuddy.set(s.buddy_id!, []);
    byBuddy.get(s.buddy_id!)!.push({ id: s.id, name: s.full_name.split(' ')[0] });
  }

  const studentIds = students.map((s) => s.id);
  const buddyIds = [...byBuddy.keys()];
  const fourDaysAgo = new Date(Date.now() - 4 * 86_400_000)
    .toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const [reportsSource, sentSource, buddySource] = await Promise.all([
    readRowsForIds<string, BriefReport>('daily_reports', studentIds, (chunk) =>
      admin.from('daily_reports').select('student_id, report_date').in('student_id', chunk)
        .gte('report_date', fourDaysAgo)),
    readRowsForIds<string, BriefSent>('notifications(dedup)', buddyIds, (chunk) =>
      admin.from('notifications').select('user_id').in('user_id', chunk)
        .eq('type', 'buddy_brief').gte('created_at', todayStart)),
    readRowsForIds<string, BriefBuddy>('profiles(buddies)', buddyIds, (chunk) =>
      admin.from('profiles').select('id, notif_prefs').in('id', chunk)),
  ]);

  const deadRead = ([
    ['daily_reports', reportsSource], ['notifications', sentSource], ['profiles(buddies)', buddySource],
  ] as Array<[string, Source<unknown[]>]>).find(([, src]) => isUnavailable(src));
  if (deadRead) {
    const src = deadRead[1] as Extract<Source<unknown[]>, { state: 'unavailable' }>;
    return briefSourceDead(`${deadRead[0]}: ${src.reason}`, byBuddy.size);
  }

  const rowsOf = <T,>(src: Source<T[]>): T[] => (src.state === 'value' ? src.value : []);
  const reportDates = new Map<string, string[]>();
  for (const r of rowsOf(reportsSource)) {
    if (!reportDates.has(r.student_id)) reportDates.set(r.student_id, []);
    reportDates.get(r.student_id)!.push(r.report_date);
  }
  const already = new Set(rowsOf(sentSource).map((n) => n.user_id));
  const buddyById = new Map(rowsOf(buddySource).map((b) => [b.id, b]));

  let sent = 0;
  for (const [buddyId, roster] of byBuddy) {
    const buddy = buddyById.get(buddyId);
    if (!buddy) continue;

    // The AI freshness pass used to live here: every student who logged
    // yesterday had their facts-briefing regenerated before their buddy opened
    // the app — "ambient, not opt-in".
    //
    // Founder, 9 Aug: "don't automatically produce AI response — someone has to
    // tap to get the response, don't make it auto ready." Ambient is exactly
    // what he is ruling out, and the arithmetic agrees: this loop is one Gemini
    // call per logging student per morning, inside a cron that already iterates
    // every student in a single invocation. It is the fastest-growing AI cost
    // in the product and the one nobody asked for.
    //
    // The push below still goes out, so the buddy still learns who logged and
    // who is at risk. The summary is written when they tap Refresh.
    if (already.has(buddyId)) continue;

    const loggedYesterday = roster.filter((s) => (reportDates.get(s.id) ?? []).includes(yesterday)).length;
    // "At risk" = no log yesterday AND none the day before.
    const twoDaysAgo = new Date(new Date(yesterday + 'T00:00:00+05:30').getTime() - 86_400_000)
      .toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const atRisk = roster
      .filter((s) => {
        const dates = reportDates.get(s.id) ?? [];
        return !dates.includes(yesterday) && !dates.includes(twoDaysAgo);
      })
      .map((s) => s.name);

    const { title, body } = buddyBriefCopy(loggedYesterday, roster.length, atRisk);

    const prefs = (buddy.notif_prefs ?? {}) as Record<string, unknown>;
    const outcome = await dispatch({
      userId: buddyId, type: 'buddy_brief', title, body, url: '/buddy/home',
      reason: 'Daily 9am roster brief — who logged, who is at risk', expectedAction: 'acknowledge', prefs,
    });
    if (outcome === 'sent') sent++;
  }

  return NextResponse.json({ ok: true, sent, buddies: byBuddy.size });
}

export { POST as GET };
