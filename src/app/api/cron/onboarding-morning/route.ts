import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushToUser } from '@/lib/push';
import { onboardingCopy } from '@/lib/notification-engine';
import { authorizedCron } from '@/lib/cron-auth';

// 04:30 UTC = 10:00 IST. First touch of the day for students still inside their
// first 7 days of logging — the hardest window to survive. Paired with the
// evening reminder (which auto-switches to onboarding copy for these same
// students), this gives onboarding exactly two touches/day; the normal system
// takes over the moment a student reaches 7 logged days.
export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const todayStart = new Date(today + 'T00:00:00+05:30').toISOString();
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000).toISOString();

  const { data: candidates } = await admin
    .from('profiles')
    .select('id, full_name, notif_prefs, created_at')
    .eq('role', 'student')
    .eq('is_demo', false)
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
    const loggedDays = loggedDaysByStudent.get(c.id) ?? new Set();
    if (loggedDays.size >= 7) continue;              // graduated — normal system owns them now
    if (loggedDays.has(today)) continue;              // already logged today
    const prefs = (c.notif_prefs ?? {}) as Record<string, unknown>;
    if (prefs.daily_reminder === false) continue;

    const dayNumber = loggedDays.size + 1;             // the day they're about to complete
    const copy = onboardingCopy(dayNumber, 'pending', c.full_name.split(' ')[0]);
    if (!copy) continue;

    await admin.from('notifications').insert({
      user_id: c.id, type: 'onboarding_morning', title: copy.title, body: copy.body,
      data: { url: '/student/tracker' }, read: false, channel: 'in_app',
    });
    if (prefs.push === true) await sendPushToUser(c.id, { ...copy, url: '/student/tracker' });
    sent++;
  }

  return NextResponse.json({ sent, candidates: candidates.length });
}

export { POST as GET };
