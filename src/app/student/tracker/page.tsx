import { redirect } from 'next/navigation';
import Image from 'next/image';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthUser } from '@/lib/auth';
import { DailyTrackerApp } from '@/components/DailyTracker/DailyTrackerApp';
import { UrgentHelpBanner } from './urgent-help-banner';
import { TrajectoryWall } from '@/components/DailyTracker/TrajectoryWall';
import { AddToHomeScreenBanner } from '@/components/add-to-home-screen';
import { AnchorLine } from '@/components/DailyTracker/AnchorLine';
import { getLogDateString } from '@/lib/streak-utils';
import { getCurrentMission, MISSION_TARGET } from '@/lib/missions';
import type { StreakData } from '@/types';

export const metadata = {
  title: 'CareerRai',
  description: 'Your CAT prep command centre',
};

const CAT_EXAM_DATE = new Date(2026, 10, 29); // Nov 29, 2026

export default async function DailyTrackerPage() {
  const t0 = performance.now();
  const user = await getAuthUser();
  const tAuth = performance.now();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString().split('T')[0];

  // Single DB round-trip: all independent queries in one Promise.all.
  const [
    { data: profile },
    { data: sessions },
    { data: pendingReqs },
    { data: anyDebrief },
    { data: logs },
    { count: mockCount },
    { data: recentMock },
    { data: streakRow },
  ] = await Promise.all([
    admin.from('profiles').select('full_name, cat_percentile, buddy_id, dream_colleges, target_percentile').eq('id', user.id).single(),
    admin
      .from('video_sessions')
      .select('id, title, scheduled_at, google_meet_link')
      .eq('student_id', user.id)
      .eq('session_status', 'scheduled')
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(1),
    admin
      .from('session_requests')
      .select('id')
      .eq('student_id', user.id)
      .eq('status', 'pending')
      .limit(1),
    admin
      .from('mock_debriefs')
      .select('id')
      .eq('student_id', user.id)
      .limit(1),
    admin
      .from('daily_reports')
      .select('report_date, study_duration')
      .eq('student_id', user.id)
      .order('report_date', { ascending: false })
      .limit(90),
    admin
      .from('mock_debriefs')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', user.id),
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

  // TEMP perf instrumentation — real region + phase timings in Vercel logs.
  console.log(JSON.stringify({
    tag: 'perf:tracker',
    region: process.env.VERCEL_REGION ?? 'local',
    auth_ms: Math.round(tAuth - t0),
    db1_ms: Math.round(performance.now() - tAuth),
  }));

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there';
  const buddyId = profile?.buddy_id ?? null;
  const dreamColleges = (profile?.dream_colleges as string[] | null) ?? [];
  const dreamCollege = dreamColleges[0] ?? null;
  const targetPercentile = (profile?.target_percentile as number | null) ?? 90;

  // Second batch — only runs when there IS a buddy or a recent mock.
  let buddyProfile: { full_name: string | null; cat_percentile: number | null } | null = null;
  let existingDebrief: { id: string } | null = null;
  let initialFeedback: { feedback_text: string; feedback_date: string; feedback_type: string } | null = null;

  if (buddyId || recentMock) {
    const results = await Promise.all([
      buddyId
        ? admin.from('profiles').select('full_name, cat_percentile').eq('id', buddyId).maybeSingle().then((r) => r.data)
        : Promise.resolve(null),
      recentMock
        ? admin.from('mock_debriefs').select('id').eq('student_id', user.id).eq('log_date', recentMock.report_date).maybeSingle().then((r) => r.data)
        : Promise.resolve(null),
      buddyId
        ? admin.from('buddy_feedback').select('feedback_text, feedback_date, feedback_type').eq('student_id', user.id).eq('feedback_type', 'buddy_feedback').order('feedback_date', { ascending: false }).limit(1).maybeSingle().then((r) => r.data)
        : Promise.resolve(null),
    ]);
    buddyProfile = results[0];
    existingDebrief = results[1];
    initialFeedback = results[2];
  }

  let buddyName: string | null = null;
  if (buddyProfile?.full_name) {
    buddyName = buddyProfile.full_name.split(' ')[0] +
      (buddyProfile.cat_percentile != null ? ` · ${Math.round(Number(buddyProfile.cat_percentile))}%ile` : '');
  }

  const serverPendingDebrief: { report_date: string; updated_at: string } | null =
    recentMock && !existingDebrief ? recentMock : null;

  // Miss-recovery detection.
  let recovery: { missedDays: number; previousStreak: number } | null = null;
  if (streakRow?.last_log_date && (streakRow.current_streak ?? 0) > 0) {
    const todayStr = getLogDateString();
    const gap = Math.round((Date.parse(todayStr) - Date.parse(streakRow.last_log_date)) / 86_400_000);
    if (gap >= 2) recovery = { missedDays: gap - 1, previousStreak: streakRow.current_streak as number };
  }

  const initialLogging = {
    streak: (streakRow as StreakData | null) ?? null,
    hasLoggedToday: (logs?.[0]?.report_date ?? null) === getLogDateString(),
  };

  // Monthly mission — computed from already-fetched logs (no extra query).
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const daysInMission = logs?.filter(
    (l) => (l.report_date as string).startsWith(currentMonthStr) && (l.study_duration as number) > 0
  ).length ?? 0;
  const currentMission = getCurrentMission(now.getMonth());

  // Yesterday backlog — computed from already-fetched logs.
  const todayStr = getLogDateString();
  const todayDate = new Date(todayStr + 'T00:00:00.000Z');
  const yesterdayDate = new Date(todayDate.getTime() - 86_400_000);
  const yesterdayStr = yesterdayDate.toISOString().split('T')[0];
  const hasLoggedYesterday = logs?.some((l) => l.report_date === yesterdayStr) ?? false;
  const yesterdayLabel = yesterdayDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  const daysToCat = Math.max(0, Math.ceil((CAT_EXAM_DATE.getTime() - now.getTime()) / 86_400_000));

  const hour = now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false });
  const h = parseInt(hour);
  const greeting = h < 4 ? 'Burning the midnight oil' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';

  const nextSession = sessions?.[0] ?? null;
  const todaySession =
    nextSession && new Date(nextSession.scheduled_at).getTime() - Date.now() < 24 * 3_600_000
      ? nextSession
      : null;

  const hasPendingRequest = (pendingReqs?.length ?? 0) > 0;
  const hasDebriefedBefore = (anyDebrief?.length ?? 0) > 0;

  const logCount = logs?.length ?? 0;
  const daysStudied = logs?.filter((l) => (l.study_duration as number) > 0).length ?? 0;
  const totalMocks = mockCount ?? 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white p-4 sm:p-6">
      <div className="max-w-md mx-auto space-y-5">
        {/* Header: greeting + CRS pill + days-to-CAT chip */}
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-stone-900 truncate" style={{ fontFamily: 'Georgia, serif' }}>
            {greeting}, {firstName}
          </h1>
          <div className="flex items-center gap-1.5 shrink-0">
            {/* CRS pill only when TrajectoryWall is absent — it already shows current%ile */}
            {profile?.cat_percentile != null && !dreamCollege && (
              <span className="text-[11px] font-bold bg-stone-900 text-white rounded-full px-2.5 py-1">
                CRS {profile.cat_percentile}
              </span>
            )}
            {!dreamCollege && (
              <span className="text-[11px] font-semibold bg-orange-100 text-orange-700 rounded-full px-2.5 py-1">
                {daysToCat}d to CAT
              </span>
            )}
          </div>
        </div>

        {/* Emotional anchor line — dost-wala Hinglish, rotates slowly */}
        <AnchorLine />

        {/* Trajectory Wall — dream-anchored, present once college set */}
        <TrajectoryWall
          dreamCollege={dreamCollege}
          currentPercentile={profile?.cat_percentile as number | null}
          targetPercentile={targetPercentile}
          logCount={logCount}
          mockCount={totalMocks}
          daysStudied={daysStudied}
        />

        {buddyId && (
          <UrgentHelpBanner
            buddyId={buddyId}
            hasPendingRequest={hasPendingRequest}
          />
        )}

        {!buddyId && (
          <div className="rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3">
            <div className="flex items-center gap-3">
              <Image
                src="/buddy-logo.jpg"
                alt="CareerRai Buddy"
                width={48}
                height={48}
                className="rounded-full shrink-0 object-cover"
              />
              <p className="text-sm text-teal-900 leading-relaxed">
                <strong>Your buddy is being matched</strong> — someone who&apos;s walked your exact
                journey. Meanwhile, log today: your first week of data is what makes their guidance sharp.
              </p>
            </div>
          </div>
        )}

        <DailyTrackerApp
          studentId={user.id}
          todaySession={todaySession}
          hasBuddy={!!buddyId}
          buddyId={buddyId}
          buddyName={buddyName}
          initialPendingDebrief={serverPendingDebrief}
          initialFeedback={initialFeedback}
          recovery={recovery}
          initialLogging={initialLogging}
          missionName={currentMission.name}
          missionFocus={currentMission.focus}
          daysInMission={daysInMission}
          missionTarget={MISSION_TARGET}
          hasLoggedYesterday={hasLoggedYesterday}
          yesterdayStr={yesterdayStr}
          yesterdayLabel={yesterdayLabel}
        />

        {!hasDebriefedBefore && (
          <div className="rounded-2xl border-2 border-dashed border-stone-300 bg-stone-50 px-4 py-4 flex items-start gap-3">
            <span className="text-xl leading-none">📋</span>
            <p className="text-xs text-stone-500 leading-relaxed">
              <strong className="text-stone-700">Your first mock debrief unlocks here.</strong>
              <br />
              This is where the real work happens — log a mock and walk every error with your buddy.
            </p>
          </div>
        )}

        <AddToHomeScreenBanner />

        <p className="text-center text-[11px] text-stone-400 pb-20">
          <a href="mailto:hello@careerrai.com" className="hover:text-stone-600 transition-colors">
            Help us improve · Give feedback
          </a>
        </p>
      </div>
    </div>
  );
}
