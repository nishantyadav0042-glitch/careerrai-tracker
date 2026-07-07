import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushToUser } from '@/lib/push';
import { authorizedCron } from '@/lib/cron-auth';
import { TOPIC_METADATA } from '@/lib/topics-constants';
import { computePrepMemory } from '@/lib/prep-memory-data';
import {
  detectRevisionDue, detectTopicEarned, detectMissionChanged, detectWeeklyEvolved, detectInactive,
  pickTopEvent, templateFor, type CoverageSignalRow,
} from '@/lib/decision-engine';

// 14:30 UTC = 20:00 IST — the one slot the retired daily-reminder used to
// own. This cron replaces daily-reminder, streak-risk, and growth-nudges:
// per the founder's own rule, "one notification, maximum, per day," a
// nightly diff engine and three separate reminder crons cannot coexist —
// running all four would just stack a fifth push on top of the old four.
//
// No AI anywhere in this file. No event bus, no snapshot table — every
// signal below reads tables that already exist (topic_coverage,
// daily_routines, streak_data). The founder's four boxes, in order:
// diff existing data -> detect events -> rank by priority -> template copy.
export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const isSunday = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' }) === 'Sun';

  const revisionFrequencyDays: Record<string, number> = Object.fromEntries(
    Object.entries(TOPIC_METADATA).map(([topic, meta]) => [topic, meta.revisionFrequencyDays])
  );

  const { data: students } = await admin
    .from('profiles')
    .select('id, notif_prefs, is_demo, is_repeater, is_working_professional, created_at')
    .eq('role', 'student').eq('is_demo', false);
  if (!students?.length) return NextResponse.json({ notified: 0, total: 0 });

  const studentIds = students.map((s) => s.id);

  const [
    { data: alreadySentToday },
    { data: coverageRows },
    { data: todayRoutines },
    { data: yesterdayRoutines },
    { data: streakRows },
  ] = await Promise.all([
    admin.from('notifications').select('user_id').in('user_id', studentIds)
      .in('type', ['revision_due', 'topic_earned', 'mission_changed', 'weekly_evolved', 'inactive_recovery'])
      .gte('created_at', `${today}T00:00:00+05:30`),
    admin.from('topic_coverage').select('student_id, topic, status, updated_at').in('student_id', studentIds),
    admin.from('daily_routines').select('student_id, tasks').in('student_id', studentIds).eq('routine_date', today),
    admin.from('daily_routines').select('student_id, tasks').in('student_id', studentIds).eq('routine_date', yesterday),
    admin.from('streak_data').select('student_id, last_log_date').in('student_id', studentIds),
  ]);

  const sentToday = new Set((alreadySentToday ?? []).map((n) => n.user_id));
  const coverageByStudent = new Map<string, CoverageSignalRow[]>();
  for (const r of coverageRows ?? []) {
    if (!coverageByStudent.has(r.student_id)) coverageByStudent.set(r.student_id, []);
    coverageByStudent.get(r.student_id)!.push({ topic: r.topic, status: r.status, updatedAt: r.updated_at });
  }
  const todayFirstBySection = new Map<string, { section: string; topic: string } | null>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of todayRoutines ?? []) todayFirstBySection.set(r.student_id, (r.tasks as any[])[0] ? { section: (r.tasks as any[])[0].section, topic: (r.tasks as any[])[0].topic } : null);
  const yesterdayFirstBySection = new Map<string, string | null>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of yesterdayRoutines ?? []) yesterdayFirstBySection.set(r.student_id, (r.tasks as any[])[0]?.section ?? null);
  const lastLogByStudent = new Map((streakRows ?? []).map((r) => [r.student_id, r.last_log_date as string | null]));

  let notified = 0;
  let silent = 0;

  for (const s of students) {
    if (sentToday.has(s.id)) continue;
    const prefs = (s.notif_prefs ?? {}) as Record<string, unknown>;
    if (prefs.daily_reminder === false) continue;

    const coverage = coverageByStudent.get(s.id) ?? [];
    const todayFirst = todayFirstBySection.get(s.id) ?? null;
    const yesterdayFirstSection = yesterdayFirstBySection.get(s.id) ?? null;
    const lastLogDate = lastLogByStudent.get(s.id) ?? null;
    const daysSinceLastLog = lastLogDate
      ? Math.round((Date.parse(today) - Date.parse(lastLogDate)) / 86_400_000)
      : null;

    let weeklyLines: string[] = [];
    if (isSunday) {
      const { weeklyEvolution } = await computePrepMemory(
        admin, s.id,
        { isRepeater: !!s.is_repeater, isWorkingProfessional: !!s.is_working_professional },
        (s.created_at as string | null)?.split('T')[0] ?? null
      );
      weeklyLines = weeklyEvolution;
    }

    const event = pickTopEvent([
      detectRevisionDue(coverage, today, revisionFrequencyDays),
      detectTopicEarned(coverage, today),
      detectMissionChanged(yesterdayFirstSection, todayFirst?.section ?? null, todayFirst?.topic ?? null),
      detectWeeklyEvolved(isSunday, weeklyLines),
      detectInactive(daysSinceLastLog),
    ]);

    if (!event) { silent++; continue; }

    const { title, body, url } = templateFor(event);
    await admin.from('notifications').insert({
      user_id: s.id, type: event.type, title, body,
      data: { url }, read: false, channel: 'in_app',
    });
    if (prefs.push === true) await sendPushToUser(s.id, { title, body, url });
    notified++;
  }

  return NextResponse.json({ notified, silent, total: students.length });
}

export { POST as GET };
