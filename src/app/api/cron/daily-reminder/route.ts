import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendDailyReminder } from '@/lib/email';
import { onboardingCopy } from '@/lib/notification-engine';
import { authorizedCron } from '@/lib/cron-auth';
import { ACTIVATION_DAYS, activationCopy, dispatch, BUDGET_ACTIVE, BUDGET_SETUP, dreamCollegeLabel } from '@/lib/notification-os';
import { sweep, incompleteWarning } from '@/lib/cron-sweep';
import { sendAdminAlert } from '@/lib/email';
import { withCronTracking } from '@/lib/cron-run-tracker';
import { readRows, isUnavailable, type Source } from '@/lib/truth/source';
import { readRowsForIds } from '@/lib/truth/batch';

// ── B3b #3 — read safety ONLY ──────────────────────────────────────────────
//
// Activation/staging semantics are untouched: the 14-day candidate window, the
// ACTIVATION_DAYS ladder, the `loggedDays.size >= 7` graduation, the IST
// calendar `today`, and every piece of copy stay exactly as they were.
//
// READ -> DERIVED DECISION -> SIDE EFFECT, which is what a "the read is
// chunked, so it is safe" claim misses:
//
//   profiles                -> who is a candidate at all      -> (gates everything)
//   daily_reports(today)    -> "already logged today?"        -> reminder SUPPRESSED or sent
//   daily_reports(all)      -> loggedDays.size: 0 = never
//                              logged (activation ladder),
//                              >=7 = graduated                -> WHICH ladder, and the day number
//   notifications           -> "already reminded today?"      -> duplicate send
//
// Every one of those decisions reads a MISSING ROW as a fact about the student.
// An empty result from a dead query says "never logged" just as loudly as a
// genuinely empty table, and the student is then told so.
interface ReminderStudent {
  id: string;
  full_name: string;
  email: string | null;
  notif_prefs: unknown;
  created_at: string;
  onboarding_completed: boolean | null;
  onboarding_last_activity_at: string | null;
  dream_colleges: unknown;
}

/** One shape for every "a source died, remind nobody" exit. */
function reminderSourceDead(reason: string, candidates: number) {
  console.error('[daily-reminder] source unavailable — nobody was reminded', reason);
  return NextResponse.json(
    { ok: false, skipped: 'source_unavailable', reason, reminded: 0, candidates },
    { status: 503 });
}

// Every invocation of this route walks the whole student roster. Vercel's
// default ceiling was never a decision anyone made here — it was simply
// inherited, and when it is reached the invocation is killed mid-loop and the
// students at the END of the ordering are silently never processed. Same
// students, every day, invisibly. 300s is declared so the ceiling is a choice,
// and lib/cron-sweep keeps the walk inside it.
export const maxDuration = 300;

// 14:30 UTC = 20:00 IST. The evening touch for students in their first two
// weeks — two distinct populations, one send each, both through dispatch()
// (global 2/day budget + measurement):
//
//   1. Day 1-7 habit arc (logged at least once, <7 logged days): the
//      original onboarding evening copy.
//   2. Activation ladder (Builder done, NEVER logged): "your routine is
//      waiting" on days 0/1/3/7 after the build, then silence + the human
//      queue. This replaces the old behaviour of sending them the same
//      "Day 1" copy twice a day for 14 days — repetition without
//      escalation or an end is a nag, not a system.
//
// Builder-incomplete students are skipped entirely — they can't log (the
// mandatory Builder gate blocks the tracker), so any "log today" ask here
// was impossible on tap; /api/cron/builder-recovery owns them.
// Students past the arc are owned by /api/cron/decision-engine at this same
// slot — the state split is what makes the two crons collision-free.
export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return withCronTracking('/api/cron/daily-reminder', async () => dailyReminderRun());
}

async function dailyReminderRun(): Promise<NextResponse> {
  const admin = createAdminClient();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const todayStart = new Date(today + 'T00:00:00+05:30').toISOString();
  const fourteenDaysAgoIso = new Date(Date.now() - 14 * 86_400_000).toISOString();

  const studentsSource = await readRows<ReminderStudent>('profiles(students)', () =>
    admin
      .from('profiles')
      .select('id, full_name, email, notif_prefs, created_at, onboarding_completed, onboarding_last_activity_at, dream_colleges')
      .eq('role', 'student')
      .gte('created_at', fourteenDaysAgoIso));
  if (isUnavailable(studentsSource)) return reminderSourceDead(studentsSource.reason, 0);
  const students = studentsSource.state === 'value' ? studentsSource.value : [];
  if (!students.length) return NextResponse.json({ ok: true, reminded: 0 });

  const studentIds = students.map((s) => s.id);

  // ── B3b #3. This job was ALREADY chunked — and that made it look defended.
  //
  // Each chunk ended in `.data ?? []`, so ONE failed chunk contributed an empty
  // array to a flattened aggregate and the job carried on with a partial answer
  // it believed was complete. That is worse than not chunking: an unchunked
  // read fails all at once and is at least obvious. Gate 3 is exactly this —
  // one failed chunk must invalidate the aggregate, not shrink it.
  //
  // readRowsForIds keeps the chunking this file already had (its own comment,
  // below, correctly anticipated the request-line limit) and makes the failure
  // all-or-nothing.
  const [todaySource, allSource, notifSource] = await Promise.all([
    readRowsForIds<string, { student_id: string }>('daily_reports(today)', studentIds, (ids) =>
      admin.from('daily_reports').select('student_id').in('student_id', ids).eq('report_date', today)),
    readRowsForIds<string, { student_id: string; report_date: string }>('daily_reports(all)', studentIds, (ids) =>
      admin.from('daily_reports').select('student_id, report_date').in('student_id', ids)),
    readRowsForIds<string, { user_id: string }>('notifications(dedup)', studentIds, (ids) =>
      admin.from('notifications').select('user_id').in('user_id', ids)
        .in('type', ['onboarding_evening', 'activation']).gte('created_at', todayStart)),
  ]);

  const dead = ([
    ['daily_reports(today)', todaySource],
    ['daily_reports(all)', allSource],
    ['notifications', notifSource],
  ] as Array<[string, Source<unknown[]>]>).find(([, src]) => isUnavailable(src));
  if (dead) {
    const src = dead[1] as Extract<Source<unknown[]>, { state: 'unavailable' }>;
    return reminderSourceDead(`${dead[0]}: ${src.reason}`, students.length);
  }

  const rowsOf = <T,>(src: Source<T[]>): T[] => (src.state === 'value' ? src.value : []);
  const todayReports = rowsOf(todaySource);
  const allReports = rowsOf(allSource);

  const submittedIds = new Set(todayReports.map((r) => r.student_id));
  const reminderSentToday = new Set(rowsOf(notifSource).map((n) => n.user_id));

  const loggedDaysByStudent = new Map<string, Set<string>>();
  for (const r of allReports) {
    if (!loggedDaysByStudent.has(r.student_id)) loggedDaysByStudent.set(r.student_id, new Set());
    loggedDaysByStudent.get(r.student_id)!.add(r.report_date);
  }

  // The walk used to be `for (const s of students) { await dispatch(...) }` —
  // one student at a time, each waiting on a database write and a push send.
  // At roughly 150ms apiece a single invocation clears about 2,000 students
  // inside the ceiling, and everyone after that was silently skipped. Same
  // students, every evening, and the response still read "reminded: N" as
  // though N were the whole roster.
  //
  // Bounded concurrency is the fix that moves the number by an order of
  // magnitude; the deadline is what makes the shortfall a reported fact
  // instead of a kill signal nobody sees.
  let reminded = 0;
  const result = await sweep({
    items: students,
    budgetMs: maxDuration * 1000,
    handler: async (s) => {
      if (submittedIds.has(s.id) || reminderSentToday.has(s.id)) return;
      if (s.onboarding_completed !== true) return; // builder-recovery owns them
      const prefs = (s.notif_prefs ?? {}) as Record<string, unknown>;
      if (prefs.daily_reminder === false) return;

      const firstName = s.full_name.split(' ')[0];
      const loggedDays = loggedDaysByStudent.get(s.id) ?? new Set();

      if (loggedDays.size === 0) {
        // Activation ladder: plan built, never logged.
        const anchorIso = (s.onboarding_last_activity_at as string | null) ?? (s.created_at as string);
        const daysSinceBuilt = Math.floor((Date.now() - new Date(anchorIso).getTime()) / 86_400_000);
        if (!ACTIVATION_DAYS.includes(daysSinceBuilt)) return; // off-ladder days are silent
        const copy = activationCopy(daysSinceBuilt, firstName, dreamCollegeLabel(s.dream_colleges));
        const outcome = await dispatch({
          userId: s.id,
          type: 'activation',
          title: copy.title,
          body: copy.body,
          url: '/student/tracker',
          reason: `Plan built ${daysSinceBuilt === 0 ? 'today' : `${daysSinceBuilt}d ago`}, never logged — activation day ${daysSinceBuilt}`,
          expectedAction: 'log_today',
          prefs,
          email: s.email ? { to: s.email as string, send: () => sendDailyReminder(s.email as string, firstName) } : null,
          dailyBudget: BUDGET_SETUP,
        });
        if (outcome === 'sent') reminded++;
        return;
      }

      if (loggedDays.size >= 7) return; // graduated — decision-engine owns them

      const onboarding = onboardingCopy(loggedDays.size + 1, 'pending', firstName)!;
      const outcome = await dispatch({
        userId: s.id,
        type: 'onboarding_evening',
        title: onboarding.title,
        body: onboarding.body,
        url: '/student/tracker',
        reason: `Day ${loggedDays.size + 1} of the 7-day habit arc, no log today — evening touch`,
        expectedAction: 'log_today',
        prefs,
        email: s.email ? { to: s.email as string, send: () => sendDailyReminder(s.email as string, firstName) } : null,
        dailyBudget: BUDGET_ACTIVE, // arc students get the full companion cadence too
      });
      if (outcome === 'sent') reminded++;
    },
  });

  // A partial sweep is an incident, not a footnote on a JSON blob nobody reads.
  if (!result.complete) {
    const warning = incompleteWarning('daily-reminder', result);
    console.error(warning);
    await sendAdminAlert(
      `⚠️ daily-reminder skipped ${result.remaining} students`,
      `<pre style="font-family:monospace;font-size:13px">${warning}</pre>`,
    ).catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    reminded,
    total: students.length,
    complete: result.complete,
    skipped: result.remaining,
    failed: result.failed,
  });
}

export { POST as GET };
