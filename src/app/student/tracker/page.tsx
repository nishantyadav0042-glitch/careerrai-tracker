import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthUser } from '@/lib/auth';
import { DailyTrackerApp } from '@/components/DailyTracker/DailyTrackerApp';
import { getLogDateString } from '@/lib/streak-utils';
import { TodaysRoutineCard } from '@/components/DailyTracker/TodaysRoutineCard';
import { SetPasswordReminder } from '@/components/set-password-reminder';
import { InstallAppButton } from '@/components/install-app-button';
import { PaceCard } from '@/components/home/pace-card';
import { TopicStats } from '@/components/home/topic-stats';
import { remainingSyllabusHours, remainingMockHours, computeRequiredPace } from '@/lib/study-pace';
import { computeTopicMemory, buildCompletionRecords } from '@/lib/prep-memory-data';
import { getStudentProfile } from '@/lib/student-profile';
import { projectSyllabusFinish } from '@/lib/study-plan';
import { catExamDate } from '@/lib/routine-engine';
import { TOPIC_METADATA } from '@/lib/topics-constants';
import { Flame, CalendarCheck, ChevronRight } from 'lucide-react';
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

  // Topic-memory's two source reads (full-history completions + topic_coverage)
  // depend only on user.id — not on the profile — so they ride in this one
  // parallel wave and are handed to computeTopicMemory prefetched, instead of
  // running as a second serial round-trip wave after this Promise.all resolves.
  const [
    profile,
    { data: sessions },
    { data: logs },
    { data: recentMock },
    { data: streakRow },
    completionRecords,
    { data: coverageRows },
  ] = await Promise.all([
    getStudentProfile(user.id),
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
      .limit(500),
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
    buildCompletionRecords(admin, user.id, '2000-01-01'),
    admin.from('topic_coverage').select('topic, status, updated_at').eq('student_id', user.id),
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
  const topicMemory = await computeTopicMemory(admin, user.id, archetype, {
    completionRecords,
    coverageRows: coverageRows ?? [],
  });
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
  // Precise, per-topic study pace: hours of syllabus still ahead (weighted by
  // each topic's own estimatedHours + how far the student is on it) → the
  // daily-hours requirement to hit their date. Auto catch-up / roll-over.
  const targetIso = (profile?.syllabus_target_date as string | null) ?? null;
  const paceRemainingHours = remainingSyllabusHours(topicMemory);
  const pace = targetIso
    ? computeRequiredPace({
        remainingHours: paceRemainingHours,
        mockHours: remainingMockHours(paceRemainingHours),
        today: now,
        targetDate: new Date(targetIso + 'T00:00:00'),
        committedPerDay: (profile?.study_target_hours as number | null) ?? null,
      })
    : null;
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

  // Total study time (all logs) + a 7-day study-hours sparkline for the pace card.
  const totalStudyHours = (logs ?? []).reduce((s, l) => s + (Number(l.study_duration) || 0), 0);
  const hoursByDate = new Map((logs ?? []).map((l) => [l.report_date, Number(l.study_duration) || 0]));
  const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const week: number[] = [];
  const weekLabels: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayDate.getTime() - i * 86_400_000);
    week.push(hoursByDate.get(d.toISOString().split('T')[0]) ?? 0);
    weekLabels.push(WEEKDAY[d.getUTCDay()]);
  }

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
    <div className="min-h-screen bg-stone-50 p-4 sm:p-6">
      <div className="max-w-md mx-auto space-y-4">
        {/* Greeting + streak card */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold leading-tight text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
              Hello, {firstName}! <span aria-hidden>👋</span>
            </h1>
            <p className="mt-0.5 text-sm text-stone-500">Discipline today, success tomorrow.</p>
          </div>
          <Link href="/student/journey"
            className="flex shrink-0 items-center gap-2 rounded-2xl border border-stone-200/70 bg-white px-3.5 py-2.5 shadow-sm transition-colors hover:border-stone-300">
            <Flame className={currentStreak > 0 ? 'h-6 w-6 text-orange-500' : 'h-6 w-6 text-stone-300'} />
            <div className="leading-none">
              <div className="text-xl font-extrabold text-stone-900 tabular-nums">{currentStreak}</div>
              <div className="mt-0.5 text-[11px] font-medium text-stone-500">day streak</div>
            </div>
            <ChevronRight className="h-4 w-4 text-stone-300" />
          </Link>
        </div>

        {/* Progress card — % of syllabus done, pace, weekly trend, reschedule.
            Shown whenever they've committed to a finish date. */}
        {pace && targetIso && <PaceCard pace={pace} targetIso={targetIso} week={week} weekLabels={weekLabels} />}

        {/* Four at-a-glance study stats */}
        <TopicStats completed={startedOnceCount} inProgress={learningCount} total={totalTopics} studyHours={totalStudyHours} />

        {/* Fallback pace strip only when there's no ring (no target date yet). */}
        {!pace && finishStrip && (
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

        {/* Mockup order: Today's Focus (the log) first, then Today's Plan.
            Install card stays pinned on top for browser users; it hides itself
            in the installed app. */}
        <div className="flex flex-col gap-4">
          <div className="order-1 empty:hidden">
            <InstallAppButton variant="card" />
          </div>

          {/* Today's Focus — have I logged today's study? */}
          <div className="order-2">
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
          </div>

          {/* Today's Plan — what should I study? */}
          <div className="order-3">
            <TodaysRoutineCard />
          </div>
        </div>

        <div className="pb-16" />
      </div>
    </div>
  );
}
