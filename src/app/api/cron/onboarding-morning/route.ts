import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { onboardingCopy } from '@/lib/notification-engine';
import { authorizedCron } from '@/lib/cron-auth';
import { dispatch, BUDGET_ACTIVE } from '@/lib/notification-os';
import { withCronTracking } from '@/lib/cron-run-tracker';
import { readRows, isUnavailable, type Source } from '@/lib/truth/source';
import { readRowsForIds } from '@/lib/truth/batch';

// ── B3b #4 — read safety ONLY ──────────────────────────────────────────────
//
// Staging semantics untouched: the 14-day candidate window, `size === 0` ->
// activation ladder owns them, `size >= 7` -> graduated, `has(today)` -> skip,
// the IST calendar `today`, and every piece of copy.
//
// READ -> DERIVED DECISION -> SIDE EFFECT:
//
//   profiles          -> who is a candidate               -> (gates everything)
//   daily_reports     -> loggedDays.size, which decides
//                        BOTH whether to send AND
//                        `dayNumber = size + 1`           -> push, AND THE NUMBER
//                                                            INSIDE THE MESSAGE
//   notifications     -> "already sent this morning?"     -> duplicate push
//
// The middle row is why this job needed the migration more than its send-count
// suggests. `loggedDays.size` is not only a gate — it becomes `dayNumber`, and
// `dayNumber` is rendered to the student as which day of the 7-day arc they are
// on. A partially-failed read does not merely under-send; it tells a student
// they are on day 2 of their arc when they are on day 5. That is an
// infrastructure failure becoming a student-facing claim, which is the exact
// thing the invariant forbids.
interface MorningCandidate {
  id: string;
  full_name: string;
  notif_prefs: unknown;
  created_at: string;
  onboarding_completed: boolean | null;
}

function morningSourceDead(reason: string, candidates: number) {
  console.error('[onboarding-morning] source unavailable — nobody was messaged', reason);
  return NextResponse.json(
    { ok: false, skipped: 'source_unavailable', reason, sent: 0, candidates },
    { status: 503 });
}

// Every invocation of this route walks the whole student roster. Vercel's
// default ceiling was never a decision anyone made here — it was simply
// inherited, and when it is reached the invocation is killed mid-loop and the
// students at the END of the ordering are silently never processed. Same
// students, every day, invisibly. 300s is declared so the ceiling is a choice,
// and lib/cron-sweep keeps the walk inside it.
export const maxDuration = 300;

// 04:30 UTC = 10:00 IST. Morning touch of the Day 1-7 habit arc — but ONLY
// for students who are actually inside it (state = onboarding_arc):
//   - Builder incomplete → skipped. They can't log (the mandatory Builder
//     gate blocks the tracker), so "log karo" here was an impossible ask;
//     /api/cron/builder-recovery owns them with honest copy.
//   - Plan built but never logged → skipped. The evening activation ladder
//     (daily-reminder) owns them on days 0/1/3/7 — not two nags a day.
// Sends go through dispatch(): global 2/day budget + measurement columns.
export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return withCronTracking('/api/cron/onboarding-morning', async () => onboardingMorningRun());
}

async function onboardingMorningRun(): Promise<NextResponse> {
  const admin = createAdminClient();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const todayStart = new Date(today + 'T00:00:00+05:30').toISOString();
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000).toISOString();

  const candidatesSource = await readRows<MorningCandidate>('profiles(candidates)', () =>
    admin
      .from('profiles')
      .select('id, full_name, notif_prefs, created_at, onboarding_completed')
      .eq('role', 'student')
      .gte('created_at', fourteenDaysAgo));
  if (isUnavailable(candidatesSource)) return morningSourceDead(candidatesSource.reason, 0);
  const candidates = candidatesSource.state === 'value' ? candidatesSource.value : [];
  if (!candidates.length) return NextResponse.json({ ok: true, sent: 0, reason: 'no_recent_signups' });

  const ids = candidates.map((c) => c.id);
  const [reportsSource, sentSource] = await Promise.all([
    readRowsForIds<string, { student_id: string; report_date: string }>('daily_reports', ids, (chunk) =>
      admin.from('daily_reports').select('student_id, report_date').in('student_id', chunk)),
    readRowsForIds<string, { user_id: string }>('notifications(dedup)', ids, (chunk) =>
      admin.from('notifications').select('user_id').in('user_id', chunk)
        .eq('type', 'onboarding_morning').gte('created_at', todayStart)),
  ]);

  const dead = ([
    ['daily_reports', reportsSource], ['notifications', sentSource],
  ] as Array<[string, Source<unknown[]>]>).find(([, src]) => isUnavailable(src));
  if (dead) {
    const src = dead[1] as Extract<Source<unknown[]>, { state: 'unavailable' }>;
    return morningSourceDead(`${dead[0]}: ${src.reason}`, candidates.length);
  }

  const rowsOf = <T,>(src: Source<T[]>): T[] => (src.state === 'value' ? src.value : []);
  const loggedDaysByStudent = new Map<string, Set<string>>();
  for (const r of rowsOf(reportsSource)) {
    if (!loggedDaysByStudent.has(r.student_id)) loggedDaysByStudent.set(r.student_id, new Set());
    loggedDaysByStudent.get(r.student_id)!.add(r.report_date);
  }
  const already = new Set(rowsOf(sentSource).map((n) => n.user_id));

  let sent = 0;
  for (const c of candidates) {
    if (already.has(c.id)) continue;
    if (c.onboarding_completed !== true) continue;     // builder-recovery owns them
    const loggedDays = loggedDaysByStudent.get(c.id) ?? new Set();
    if (loggedDays.size === 0) continue;               // activation ladder owns them
    if (loggedDays.size >= 7) continue;                // graduated — decision-engine owns them
    if (loggedDays.has(today)) continue;               // already logged today
    const prefs = (c.notif_prefs ?? {}) as Record<string, unknown>;
    if (prefs.daily_reminder === false) continue;

    const dayNumber = loggedDays.size + 1;             // the day they're about to complete
    const copy = onboardingCopy(dayNumber, 'pending', c.full_name.split(' ')[0]);
    if (!copy) continue;

    const outcome = await dispatch({
      userId: c.id,
      type: 'onboarding_morning',
      title: copy.title,
      body: copy.body,
      url: '/student/tracker',
      reason: `Day ${dayNumber} of the 7-day habit arc, no log yet today — morning touch`,
      expectedAction: 'log_today',
      prefs,
      dailyBudget: BUDGET_ACTIVE, // arc students get the full companion cadence too
    });
    if (outcome === 'sent') sent++;
  }

  return NextResponse.json({ ok: true, sent, candidates: candidates.length });
}

export { POST as GET };
