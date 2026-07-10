import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthUser } from '@/lib/auth';
import { DailyTrackerApp } from '@/components/DailyTracker/DailyTrackerApp';
import { getLogDateString } from '@/lib/streak-utils';
import { TodaysRoutineCard } from '@/components/DailyTracker/TodaysRoutineCard';
import { SetPasswordReminder } from '@/components/set-password-reminder';
import { Flame } from 'lucide-react';
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
      .select('full_name, buddy_id, password_set, created_at, notif_prefs')
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
  const daysSinceJoin = profile?.created_at
    ? Math.floor((Date.now() - new Date(profile.created_at as string).getTime()) / 86_400_000)
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

        {showPasswordReminder && <SetPasswordReminder notifPrefs={notifPrefs} />}

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
