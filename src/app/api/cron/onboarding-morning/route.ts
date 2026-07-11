import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { onboardingCopy } from '@/lib/notification-engine';
import { authorizedCron } from '@/lib/cron-auth';
import { dispatch, BUDGET_ACTIVE } from '@/lib/notification-os';

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

  const admin = createAdminClient();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const todayStart = new Date(today + 'T00:00:00+05:30').toISOString();
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000).toISOString();

  const { data: candidates } = await admin
    .from('profiles')
    .select('id, full_name, notif_prefs, created_at, onboarding_completed')
    .eq('role', 'student')
    .gte('created_at', fourteenDaysAgo);
  if (!candidates?.length) return NextResponse.json({ sent: 0, reason: 'no_recent_signups' });

  const ids = candidates.map((c) => c.id);
  const [{ data: allReports }, { data: sentToday }] = await Promise.all([
    admin.from('daily_reports').select('student_id, report_date').in('student_id', ids),
    admin.from('notifications').select('user_id').in('user_id', ids).eq('type', 'onboarding_morning').gte('created_at', todayStart),
  ]);

  const loggedDaysByStudent = new Map<string, Set<string>>();
  for (const r of allReports ?? []) {
    if (!loggedDaysByStudent.has(r.student_id)) loggedDaysByStudent.set(r.student_id, new Set());
    loggedDaysByStudent.get(r.student_id)!.add(r.report_date);
  }
  const already = new Set((sentToday ?? []).map((n) => n.user_id));

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

  return NextResponse.json({ sent, candidates: candidates.length });
}

export { POST as GET };
