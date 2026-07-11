import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendDailyReminder } from '@/lib/email';
import { onboardingCopy } from '@/lib/notification-engine';
import { authorizedCron } from '@/lib/cron-auth';
import { ACTIVATION_DAYS, activationCopy, dispatch, BUDGET_ACTIVE, BUDGET_SETUP } from '@/lib/notification-os';

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

  const admin = createAdminClient();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const todayStart = new Date(today + 'T00:00:00+05:30').toISOString();
  const fourteenDaysAgoIso = new Date(Date.now() - 14 * 86_400_000).toISOString();

  const { data: students } = await admin
    .from('profiles')
    .select('id, full_name, email, notif_prefs, created_at, onboarding_completed, onboarding_last_activity_at')
    .eq('role', 'student')
    .gte('created_at', fourteenDaysAgoIso);
  if (!students?.length) return NextResponse.json({ reminded: 0 });

  const studentIds = students.map((s) => s.id);

  const [
    { data: todayReports },
    { data: allReports },
    { data: todayNotifs },
  ] = await Promise.all([
    admin.from('daily_reports').select('student_id').in('student_id', studentIds).eq('report_date', today),
    admin.from('daily_reports').select('student_id, report_date').in('student_id', studentIds),
    admin.from('notifications').select('user_id').in('user_id', studentIds)
      .in('type', ['onboarding_evening', 'activation']).gte('created_at', todayStart),
  ]);

  const submittedIds = new Set((todayReports ?? []).map((r) => r.student_id));
  const reminderSentToday = new Set((todayNotifs ?? []).map((n) => n.user_id));

  const loggedDaysByStudent = new Map<string, Set<string>>();
  for (const r of allReports ?? []) {
    if (!loggedDaysByStudent.has(r.student_id)) loggedDaysByStudent.set(r.student_id, new Set());
    loggedDaysByStudent.get(r.student_id)!.add(r.report_date);
  }

  let reminded = 0;
  for (const s of students) {
    if (submittedIds.has(s.id) || reminderSentToday.has(s.id)) continue;
    if (s.onboarding_completed !== true) continue; // builder-recovery owns them
    const prefs = (s.notif_prefs ?? {}) as Record<string, unknown>;
    if (prefs.daily_reminder === false) continue;

    const firstName = s.full_name.split(' ')[0];
    const loggedDays = loggedDaysByStudent.get(s.id) ?? new Set();

    if (loggedDays.size === 0) {
      // Activation ladder: plan built, never logged.
      const anchorIso = (s.onboarding_last_activity_at as string | null) ?? (s.created_at as string);
      const daysSinceBuilt = Math.floor((Date.now() - new Date(anchorIso).getTime()) / 86_400_000);
      if (!ACTIVATION_DAYS.includes(daysSinceBuilt)) continue; // off-ladder days are silent
      const copy = activationCopy(daysSinceBuilt, firstName);
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
      continue;
    }

    if (loggedDays.size >= 7) continue; // graduated — decision-engine owns them

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
  }

  return NextResponse.json({ reminded, total: students.length });
}

export { POST as GET };
