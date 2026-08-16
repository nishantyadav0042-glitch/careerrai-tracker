import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { TOPIC_METADATA } from '@/lib/topics-constants';
import { computePrepMemory } from '@/lib/prep-memory-data';
import {
  detectRevisionDue, detectTopicEarned, detectMissionChanged, detectWeeklyEvolved, detectRecovery,
  selectEvents, templateFor, reasonFor, type CoverageSignalRow, type DecisionEventType,
} from '@/lib/decision-engine';
import { computeStudentState, dispatch, BUDGET_ACTIVE, BUDGET_RECOVERY, type ExpectedAction } from '@/lib/notification-os';
import { withCronTracking } from '@/lib/cron-run-tracker';

// Every invocation of this route walks the whole student roster. Vercel's
// default ceiling was never a decision anyone made here — it was simply
// inherited, and when it is reached the invocation is killed mid-loop and the
// students at the END of the ordering are silently never processed. Same
// students, every day, invisibly. 300s is declared so the ceiling is a choice,
// and lib/cron-sweep keeps the walk inside it.
export const maxDuration = 300;

// 14:30 UTC = 20:00 IST — the evening slot.
//
// Notification-OS rules (see lib/notification-os.ts): every student is in
// exactly ONE state, and the state decides which event families are even
// eligible here:
//   building_plan  → owned by /api/cron/builder-recovery, skipped entirely
//   plan_ready     → owned by daily-reminder's activation ladder, skipped
//   onboarding_arc → owned by the Day 1-7 arc crons, skipped (this is the
//                    structural fix for the old 14:30 double-fire — the two
//                    crons at this slot now target disjoint students)
//   slipping/inactive/dark → recovery ladder ONLY (exact days 2/4/7/14; a
//                    "Geometry revision due" push to a 5-day-quiet student
//                    ignores reality, so product events are suppressed)
//   active         → product events, cap 2/day, silence when nothing fired
//
// Budget (2/day across ALL student-facing types) and push-cooldown are
// enforced inside dispatch(), not per-cron. No AI anywhere in this file.
const DAILY_CAP = 2;

const EXPECTED: Record<DecisionEventType, ExpectedAction> = {
  revision_due: 'log_today',
  topic_earned: 'open_plan',
  mission_changed: 'log_today',
  weekly_evolved: 'open_plan',
  inactive_recovery: 'log_today',
};

export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return withCronTracking('/api/cron/decision-engine', async () => decisionEngineRun());
}

async function decisionEngineRun(): Promise<NextResponse> {
  const admin = createAdminClient();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const isSunday = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' }) === 'Sun';

  const revisionFrequencyDays: Record<string, number> = Object.fromEntries(
    Object.entries(TOPIC_METADATA).map(([topic, meta]) => [topic, meta.revisionFrequencyDays])
  );

  const { data: students } = await admin
    .from('profiles')
    .select('id, notif_prefs, is_repeater, is_working_professional, created_at, onboarding_completed')
    .eq('role', 'student');
  if (!students?.length) return NextResponse.json({ notified: 0, total: 0 });

  const studentIds = students.map((s) => s.id);
  // Arc detection needs logged-day counts, but only to distinguish <7 from
  // >=7 for students who joined within 14 days — a 21-day report window is
  // strictly wider than any window that matters, and stays bounded forever.
  const reportsWindowStart = new Date(Date.now() - 21 * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  const [
    { data: coverageRows },
    { data: todayRoutines },
    { data: yesterdayRoutines },
    { data: streakRows },
    { data: recentReports },
  ] = await Promise.all([
    admin.from('topic_coverage').select('student_id, topic, status, updated_at').in('student_id', studentIds),
    admin.from('daily_routines').select('student_id, tasks').in('student_id', studentIds).eq('routine_date', today),
    admin.from('daily_routines').select('student_id, tasks').in('student_id', studentIds).eq('routine_date', yesterday),
    admin.from('streak_data').select('student_id, last_log_date').in('student_id', studentIds),
    admin.from('daily_reports').select('student_id, report_date').in('student_id', studentIds).gte('report_date', reportsWindowStart),
  ]);

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
  const loggedDaysByStudent = new Map<string, Set<string>>();
  for (const r of recentReports ?? []) {
    if (!loggedDaysByStudent.has(r.student_id)) loggedDaysByStudent.set(r.student_id, new Set());
    loggedDaysByStudent.get(r.student_id)!.add(r.report_date);
  }

  // 16 Aug, Notification Reliability V2 Phase 11: this route had NO same-day
  // dedup at all — proven in production to duplicate-send inactive_recovery
  // (~10-20 students/day) whenever the GitHub Actions cron fallback and
  // Vercel's own scheduler both fired the 20:00 IST slot. Every other cron
  // in this file's own family (daily-reminder, study-companion,
  // onboarding-morning) already checks "did I send this type to this
  // student today" before dispatching — this brings decision-engine in
  // line with its siblings. The migration's unique index is the hard
  // backstop; this is the cheap check that avoids hitting it in the first
  // place.
  const todayStartIso = today + 'T00:00:00+05:30';
  const { data: alreadySentRows } = await admin
    .from('notifications')
    .select('user_id, type')
    .in('user_id', studentIds)
    .in('type', ['revision_due', 'topic_earned', 'mission_changed', 'weekly_evolved', 'inactive_recovery'])
    .gte('created_at', todayStartIso);
  const alreadySentToday = new Set((alreadySentRows ?? []).map((r) => `${r.user_id}:${r.type}`));

  let notified = 0;
  let silent = 0;
  let ownedElsewhere = 0;
  let dedupSuppressed = 0;

  for (const s of students) {
    const prefs = (s.notif_prefs ?? {}) as Record<string, unknown>;
    if (prefs.daily_reminder === false) continue;

    const lastLogDate = lastLogByStudent.get(s.id) ?? null;
    const daysSinceLastLog = lastLogDate
      ? Math.round((Date.parse(today) - Date.parse(lastLogDate)) / 86_400_000)
      : null;
    const daysSinceJoin = Math.floor((Date.now() - new Date(s.created_at as string).getTime()) / 86_400_000);

    const state = computeStudentState({
      onboardingCompleted: s.onboarding_completed === true,
      daysSinceLastLog,
      loggedDaysTotal: loggedDaysByStudent.get(s.id)?.size ?? 0,
      daysSinceJoin,
    });

    if (state === 'building_plan' || state === 'plan_ready' || state === 'onboarding_arc') {
      ownedElsewhere++;
      continue;
    }

    let events;
    if (state === 'slipping' || state === 'inactive' || state === 'dark') {
      const recovery = detectRecovery(daysSinceLastLog);
      events = recovery ? [recovery] : []; // non-ladder days are silent, on purpose
    } else {
      const coverage = coverageByStudent.get(s.id) ?? [];
      const todayFirst = todayFirstBySection.get(s.id) ?? null;
      const yesterdayFirstSection = yesterdayFirstBySection.get(s.id) ?? null;

      let weeklyLines: string[] = [];
      if (isSunday) {
        const { weeklyEvolution } = await computePrepMemory(
          admin, s.id,
          { isRepeater: !!s.is_repeater, isWorkingProfessional: !!s.is_working_professional },
          (s.created_at as string | null)?.split('T')[0] ?? null
        );
        weeklyLines = weeklyEvolution;
      }

      events = selectEvents([
        detectRevisionDue(coverage, today, revisionFrequencyDays),
        detectTopicEarned(coverage, today),
        detectMissionChanged(yesterdayFirstSection, todayFirst?.section ?? null, todayFirst?.topic ?? null),
        detectWeeklyEvolved(isSunday, weeklyLines),
      ], DAILY_CAP);
    }

    if (events.length === 0) { silent++; continue; }

    for (const event of events) {
      if (alreadySentToday.has(`${s.id}:${event.type}`)) { dedupSuppressed++; continue; }
      const { title, body, url } = templateFor(event);
      const outcome = await dispatch({
        userId: s.id, type: event.type, title, body, url,
        reason: reasonFor(event),
        expectedAction: EXPECTED[event.type],
        prefs,
        // Active students share the day's budget with the Study Companion
        // cadence; recovery states keep the tight cap — volume is help for
        // a studying student and noise for a silent one.
        dailyBudget: state === 'active' ? BUDGET_ACTIVE : BUDGET_RECOVERY,
      });
      if (outcome === 'sent') notified++;
    }
  }

  return NextResponse.json({ notified, silent, ownedElsewhere, dedupSuppressed, total: students.length });
}

export { POST as GET };
