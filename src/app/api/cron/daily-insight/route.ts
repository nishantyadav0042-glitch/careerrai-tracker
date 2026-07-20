import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { computeDailyInsight } from '@/lib/daily-insight';
import { dispatch } from '@/lib/notification-os';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Daily one-liner insight (founder, 21 July) — 5 PM IST, before the evening
// study block: one specific, data-earned sentence per student ("this is the
// pattern / one advice from CareerRai"), never a generic stat dump. Students
// need ≥2 logged days (patterns need history — never-logged students are the
// activation cadence's job, not this one's). Once per day per student,
// enforced by the daily_insight notification marker; volume capped by the
// shared notification budget in dispatch().
export async function GET(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = createAdminClient();

  const todayStart =
    new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) + 'T00:00:00+05:30';

  const [{ data: students }, { data: sentToday }, { data: reports }] = await Promise.all([
    admin
      .from('profiles')
      .select('id, full_name, notif_prefs, is_repeater, is_working_professional')
      .eq('role', 'student')
      .eq('onboarding_completed', true)
      .not('is_test_account', 'is', true)
      .not('is_demo', 'is', true),
    admin.from('notifications').select('user_id').eq('type', 'daily_insight').gte('created_at', todayStart),
    admin.from('daily_reports').select('student_id, report_date'),
  ]);

  const alreadySent = new Set((sentToday ?? []).map((n) => n.user_id as string));
  const daysByStudent = new Map<string, Set<string>>();
  for (const r of reports ?? []) {
    if (!daysByStudent.has(r.student_id as string)) daysByStudent.set(r.student_id as string, new Set());
    daysByStudent.get(r.student_id as string)!.add(r.report_date as string);
  }

  let sent = 0;
  let skipped = 0;
  for (const s of students ?? []) {
    if (alreadySent.has(s.id)) { skipped++; continue; }
    if ((daysByStudent.get(s.id)?.size ?? 0) < 2) { skipped++; continue; }

    const insight = await computeDailyInsight(admin, s.id, {
      isRepeater: s.is_repeater === true,
      isWorkingProfessional: s.is_working_professional === true,
    }).catch(() => null);
    if (!insight) { skipped++; continue; }

    const outcome = await dispatch({
      userId: s.id,
      type: 'daily_insight',
      title: insight.title,
      body: insight.text,
      url: '/student/tracker',
      reason: `Daily insight · ${insight.kind}`,
      expectedAction: 'open_plan',
      prefs: (s.notif_prefs ?? {}) as Record<string, unknown>,
    });
    if (outcome === 'sent') sent++;
    else skipped++;
  }

  return NextResponse.json({ ok: true, sent, skipped });
}
