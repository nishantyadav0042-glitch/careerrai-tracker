import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthUser } from '@/lib/auth';
import { DailyTrackerApp } from '@/components/DailyTracker/DailyTrackerApp';
import { getLogDateString } from '@/lib/streak-utils';
import { TodaysRoutineCard } from '@/components/DailyTracker/TodaysRoutineCard';
import { SetPasswordReminder } from '@/components/set-password-reminder';
import { InstallAppButton } from '@/components/install-app-button';
import { CoachLine } from '@/components/coach-line';
import { computeTopicMemory } from '@/lib/prep-memory-data';
import { projectSyllabusFinish } from '@/lib/study-plan';
import { catExamDate } from '@/lib/routine-engine';
import { TOPIC_METADATA } from '@/lib/topics-constants';
import { Flame, CalendarCheck } from 'lucide-react';
import type { StreakData } from '@/types';

export const metadata = {
  title: 'CareerRai',
  description: 'Your CAT prep command centre',
};

// Home has exactly two jobs: what should I study (Today's Study Plan), and
// have I logged today's study (Today's Log) — nothing else. Health, weekly
// trends, mocks, revision analytics, and Buddy all live elsewhere now; a
// widget only earns a place on this page if it answers one of those two
// questions. This is a workspace, not a dashboard.
export default async function DailyTrackerPage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  // eslint-disable-next-line react-hooks/purity -- server component, per-request "now" is correct here
  const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString().split('T')[0];

  const [
    { data: profile },
    { data: sessions },
    { data: logs },
    { data: recentMock },
    { data: streakRow },
  ] = await Promise.all([
    admin
      .from('profiles')
      .select('full_name, buddy_id, password_set, created_at, notif_prefs, attempt_year, is_repeater, is_working_professional, syllabus_target_date')
      .eq('id', user.id).single(),
    admin
      .from('video_sessions')
      .select('id, title, scheduled_at, google_meet_link')
      .eq('student_id', user.id)
      .eq('session_status', 'scheduled')
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(1),
    admin
      .from('daily_reports')
      .select('report_date, study_duration')
      .eq('student_id', user.id)
      .order('report_date', { ascending: false })
      .limit(2),
    admin
      .from('daily_reports')
      .select('report_date, updated_at')
      .eq('student_id', user.id)
      .eq('mock_taken', true)
      .gte('report_date', twoDaysAgo)
      .order('report_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from('streak_data').select('*').eq('student_id', user.id).maybeSingle(),
  ]);

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there';
  const buddyId = profile?.buddy_id ?? null;

  // Syllabus finish window (founder ask: the date belongs on TOP of Home,
  // not one tab away). Same engine as My CAT Plan — projectSyllabusFinish
  // over topicMemory — so the two surfaces can never disagree. Silent for
  // students with no pace yet (day-1 accounts shouldn't open to "stalled").
  // NOTE: topicMemory scans the student's full routine history — watch this
  // page's server time on /admin/perf as data grows.
  const archetype = { isRepeater: !!profile?.is_repeater, isWorkingProfessional: !!profile?.is_working_professional };
  const topicMemory = await computeTopicMemory(admin, user.id, archetype);
  const totalTopics = Object.keys(TOPIC_METADATA).length;
  const notStartedCount = topicMemory.filter((t) => t.status === 'not_started').length;
  const learningCount = topicMemory.filter((t) => t.status === 'learning').length;
  // Not yet studied through = not_started + still-in-learning. Same honesty
  // fix as My CAT Plan: merely opening a topic ('learning') must not make the
  // syllabus read "done", nor count as a finished topic in the Home strip.
  const remainingTopics = notStartedCount + learningCount;
  const startedLast21 = topicMemory.filter(
    (t) => t.status !== 'not_started' && t.firstTouchedDaysAgo != null && t.firstTouchedDaysAgo <= 21
  ).length;

  const now = new Date();
  let examYear = (profile?.attempt_year as number | null) ?? now.getFullYear();
  if (now > catExamDate(examYear)) examYear += 1;
  const finish = projectSyllabusFinish({
    today: now,
    examDate: catExamDate(examYear),
    topicsRemaining: remainingTopics,
    topicsStartedLast21Days: startedLast21,
  });
  // Target mode (the commitment, not a setting): if the student chose a
  // finish date in the Builder, the strip anchors on THEIR date and compares
  // pace against it. Pace-only mode remains the fallback for accounts that
  // predate the chooser.
  const targetIso = (profile?.syllabus_target_date as string | null) ?? null;
  const targetLabel = targetIso
    ? new Date(targetIso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
    : null;
  let finishStrip: { label: string; tone: 'done' | 'ahead' | 'tight' | 'critical' } | null;
  if (targetIso && targetLabel) {
    if (finish.status === 'done') {
      finishStrip = { label: `Target ${targetLabel} — syllabus complete`, tone: 'done' };
    } else if (!finish.rawFinishIso) {
      // No pace yet — show the owned commitment neutrally, never "stalled".
      finishStrip = { label: `Your target: ${targetLabel}`, tone: 'tight' };
    } else {
      const driftDays = Math.round((Date.parse(finish.rawFinishIso) - Date.parse(targetIso)) / 86_400_000);
      finishStrip =
        driftDays <= 2
          ? { label: `Your target: ${targetLabel} · on track`, tone: 'done' }
          : driftDays <= 9
            ? { label: `Your target: ${targetLabel} · pace says ${finish.windowLabel}`, tone: 'tight' }
            : { label: `Your target: ${targetLabel} · pace says ${finish.windowLabel}`, tone: 'critical' };
    }
  } else {
    finishStrip =
      finish.status === 'done'
        ? { label: 'Syllabus complete — revision & mocks now', tone: 'done' }
        : finish.windowLabel
          ? { label: `Syllabus done ${finish.windowLabel} at this pace`, tone: finish.status === 'ahead' ? 'done' : finish.status === 'tight' ? 'tight' : 'critical' }
          : null;
  }
  // Studied through (practicing+), not merely opened — matches My CAT Plan.
  const startedOnceCount = topicMemory.filter(
    (t) => t.status === 'practicing' || t.status === 'revising' || t.status === 'exam_ready'
  ).length;

  const existingDebrief = recentMock
    ? await admin.from('mock_debriefs').select('id').eq('student_id', user.id).eq('log_date', recentMock.report_date).maybeSingle().then((r) => r.data)
    : null;

  const serverPendingDebrief: { report_date: string; updated_at: string } | null =
    recentMock && !existingDebrief ? recentMock : null;

  const initialLogging = {
    streak: (streakRow as StreakData | null) ?? null,
    hasLoggedToday: (logs?.[0]?.report_date ?? null) === getLogDateString(),
  };

  // Yesterday backlog — from already-fetched logs.
  const todayStr = getLogDateString();
  const todayDate = new Date(todayStr + 'T00:00:00.000Z');
  const yesterdayDate = new Date(todayDate.getTime() - 86_400_000);
  const yesterdayStr = yesterdayDate.toISOString().split('T')[0];
  const hasLoggedYesterday = logs?.some((l) => l.report_date === yesterdayStr) ?? false;
  const yesterdayLabel = yesterdayDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  const nextSession = sessions?.[0] ?? null;
  // eslint-disable-next-line react-hooks/purity -- server component, per-request "now" is correct here
  const todaySession =
    // eslint-disable-next-line react-hooks/purity -- server component, per-request "now" is correct here
    nextSession && new Date(nextSession.scheduled_at).getTime() - Date.now() < 24 * 3_600_000
      ? nextSession
      : null;

  const currentStreak = streakRow?.current_streak ?? 0;

  // Day-2+ password nudge (founder call: the set-password wall moved out of
  // first login — from day 2 it's offered as the convenience it actually
  // is). Renders only while: no password set, joined over a day ago, and
  // not already dismissed.
  const notifPrefs = (profile?.notif_prefs ?? {}) as Record<string, unknown>;
  // eslint-disable-next-line react-hooks/purity -- server component, per-request "now" is correct here
  const nowMs = Date.now();
  const daysSinceJoin = profile?.created_at
    ? Math.floor((nowMs - new Date(profile.created_at as string).getTime()) / 86_400_000)
    : 0;
  const showPasswordReminder =
    profile?.password_set !== true &&
    daysSinceJoin >= 1 &&
    notifPrefs.password_prompt_dismissed !== true;

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white p-4 sm:p-6">
      <div className="max-w-md mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
            Hello, {firstName}
          </h1>
          <span className="inline-flex items-center gap-1 text-sm font-bold text-stone-700 shrink-0">
            <Flame className={currentStreak > 0 ? 'w-4 h-4 text-orange-500' : 'w-4 h-4 text-stone-300'} />
            {currentStreak}
          </span>
        </div>

        {/* The consequence number, always in sight: finish window at their
            current pace. Tap-through to My CAT Plan for the full picture. */}
        {finishStrip && (
          <Link
            href="/student/blueprint"
            className={
              'flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-semibold transition-colors ' +
              // Pure B&W: urgency reads off weight/fill, not hue. Behind = solid
              // black (loudest), tight = grey fill, on-track = quiet outline.
              (finishStrip.tone === 'critical'
                ? 'border-stone-900 bg-stone-900 text-white hover:bg-stone-800'
                : finishStrip.tone === 'tight'
                  ? 'border-stone-300 bg-stone-100 text-stone-900 hover:bg-stone-200'
                  : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50')
            }
          >
            <CalendarCheck className="h-4 w-4 shrink-0" />
            <span className="min-w-0 truncate">{finishStrip.label}</span>
            <span className="ml-auto shrink-0 text-[10px] font-bold opacity-60">{startedOnceCount}/{totalTopics} topics →</span>
          </Link>
        )}

        {showPasswordReminder && <SetPasswordReminder notifPrefs={notifPrefs} />}

        {/* Daily coach line — AI rewords the deterministic status facts into one
            warm sentence (server-cached per day). Loads after paint; silent if
            there's nothing honest to say yet. */}
        <CoachLine />

        {/* Install prompt lives HERE — after login, once the student has a real
            plan to come back to (and iOS needs Add-to-Home-Screen before push
            can ever fire). Self-hides the moment the app is installed/standalone. */}
        <InstallAppButton variant="card" />

        {/* Question 1: what should I study? */}
        <TodaysRoutineCard />

        {/* Question 2: have I logged today's study? */}
        <DailyTrackerApp
          studentId={user.id}
          todaySession={todaySession}
          hasBuddy={!!buddyId}
          initialPendingDebrief={serverPendingDebrief}
          initialLogging={initialLogging}
          hasLoggedYesterday={hasLoggedYesterday}
          yesterdayStr={yesterdayStr}
          yesterdayLabel={yesterdayLabel}
        />

        <div className="pb-16" />
      </div>
    </div>
  );
}
