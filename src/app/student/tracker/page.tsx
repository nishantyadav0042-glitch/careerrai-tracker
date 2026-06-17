import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthUser } from '@/lib/auth';
import { DailyTrackerApp } from '@/components/DailyTracker/DailyTrackerApp';
import { UrgentHelpBanner } from './urgent-help-banner';
import { TrajectoryWall } from '@/components/DailyTracker/TrajectoryWall';
import { getLogDateString } from '@/lib/streak-utils';
import type { StreakData } from '@/types';

export const metadata = {
  title: 'CareerRai',
  description: 'Your CAT prep command centre',
};

const CAT_EXAM_DATE = new Date(2026, 10, 29); // Nov 29, 2026

export default async function DailyTrackerPage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString().split('T')[0];

  // Month boundaries for shield count — computed once, used in batch 1.
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

  // Single DB round-trip: all independent queries in one Promise.all.
  const [
    { data: profile },
    { data: sessions },
    { data: pendingReqs },
    { data: anyDebrief },
    { data: logs },
    { data: mocks },
    { data: recentMock },
    { data: streakRow },
    { data: shieldRows },
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
      .select('id')
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
    // Streak and shields are independent — no reason to defer them.
    admin.from('streak_data').select('*').eq('student_id', user.id).maybeSingle(),
    admin.from('streak_shields').select('id').eq('student_id', user.id).gte('created_at', monthStart).lt('created_at', nextMonthStart),
  ]);

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there';
  const buddyId = profile?.buddy_id ?? null;
  const dreamColleges = (profile?.dream_colleges as string[] | null) ?? [];
  const dreamCollege = dreamColleges[0] ?? null;
  const targetPercentile = (profile?.target_percentile as number | null) ?? 90;

  // Second batch — only runs when there IS a buddy or a recent mock to look up.
  // For users with neither (e.g. new students), this skips entirely.
  let buddyProfile: { full_name: string | null; cat_percentile: number | null } | null = null;
  let existingDebrief: { id: string } | null = null;

  if (buddyId || recentMock) {
    const results = await Promise.all([
      buddyId
        ? admin.from('profiles').select('full_name, cat_percentile').eq('id', buddyId).maybeSingle().then((r) => r.data)
        : Promise.resolve(null),
      recentMock
        ? admin.from('mock_debriefs').select('id').eq('student_id', user.id).eq('log_date', recentMock.report_date).maybeSingle().then((r) => r.data)
        : Promise.resolve(null),
    ]);
    buddyProfile = results[0];
    existingDebrief = results[1];
  }

  let buddyName: string | null = null;
  if (buddyProfile?.full_name) {
    buddyName = buddyProfile.full_name.split(' ')[0] +
      (buddyProfile.cat_percentile != null ? ` · ${Math.round(Number(buddyProfile.cat_percentile))}%ile` : '');
  }

  // Server-side pending debrief: the recent mock exists but has no debrief yet.
  const serverPendingDebrief: { report_date: string; updated_at: string } | null =
    recentMock && !existingDebrief ? recentMock : null;

  // Miss-recovery: has this student lapsed (2+ days since last log, with a prior
  // streak) and not yet logged today? If so, surface the compassionate restart.
  let recovery: { missedDays: number; previousStreak: number } | null = null;
  if (streakRow?.last_log_date && (streakRow.current_streak ?? 0) > 0) {
    const todayStr = getLogDateString();
    const gap = Math.round((Date.parse(todayStr) - Date.parse(streakRow.last_log_date)) / 86_400_000);
    if (gap >= 2) recovery = { missedDays: gap - 1, previousStreak: streakRow.current_streak as number };
  }

  // Seed the hero/logging card with server data so it paints with no client fetch.
  const initialLogging = {
    streak: (streakRow as StreakData | null) ?? null,
    hasLoggedToday: (logs?.[0]?.report_date ?? null) === getLogDateString(),
    shieldsRemaining: Math.max(0, 2 - (shieldRows?.length ?? 0)),
  };

  const daysToCat = Math.max(
    0,
    Math.ceil((CAT_EXAM_DATE.getTime() - Date.now()) / 86_400_000)
  );

  const hour = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false });
  const h = parseInt(hour);
  const greeting = h < 4 ? 'Burning the midnight oil' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';

  // Only surface a session happening within the next 24h
  const nextSession = sessions?.[0] ?? null;
  const todaySession =
    nextSession && new Date(nextSession.scheduled_at).getTime() - Date.now() < 24 * 3_600_000
      ? nextSession
      : null;

  const hasPendingRequest = (pendingReqs?.length ?? 0) > 0;
  const hasDebriefedBefore = (anyDebrief?.length ?? 0) > 0;

  // Stats for trajectory wall
  const logCount = logs?.length ?? 0;
  const daysStudied = logs?.filter((l) => (l.study_duration as number) > 0).length ?? 0;
  const mockCount = mocks?.length ?? 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white p-4 sm:p-6">
      <div className="max-w-md mx-auto space-y-5">
        {/* Header: greeting + CRS pill + days-to-CAT chip */}
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-stone-900 truncate" style={{ fontFamily: 'Georgia, serif' }}>
            {greeting}, {firstName}
          </h1>
          <div className="flex items-center gap-1.5 shrink-0">
            {profile?.cat_percentile != null && (
              <span className="text-[11px] font-bold bg-stone-900 text-white rounded-full px-2.5 py-1">
                CRS {profile.cat_percentile}
              </span>
            )}
            {/* TrajectoryWall shows days+target when dreamCollege is set; only show chip when it isn't */}
            {!dreamCollege && (
              <span className="text-[11px] font-semibold bg-orange-100 text-orange-700 rounded-full px-2.5 py-1">
                {daysToCat}d to CAT
              </span>
            )}
          </div>
        </div>

        {/* Trajectory Wall — dream-anchored, always present once college set */}
        <TrajectoryWall
          dreamCollege={dreamCollege}
          currentPercentile={profile?.cat_percentile as number | null}
          targetPercentile={targetPercentile}
          logCount={logCount}
          mockCount={mockCount}
          daysStudied={daysStudied}
        />

        {/* Important: urgent help / pending session request */}
        {buddyId && (
          <UrgentHelpBanner
            buddyId={buddyId}
            hasPendingRequest={hasPendingRequest}
          />
        )}

        {/* Day one: buddy not yet matched — never a ghost town */}
        {!buddyId && (
          <div className="rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3">
            <p className="text-sm text-teal-900 leading-relaxed">
              🤝 <strong>Your buddy is being matched</strong> — a mentor who&apos;s walked your exact
              journey. Meanwhile, log today: your first week of data is what makes their guidance sharp.
            </p>
          </div>
        )}

        <DailyTrackerApp
          studentId={user.id}
          todaySession={todaySession}
          hasBuddy={!!buddyId}
          buddyId={buddyId}
          buddyName={buddyName}
          initialPendingDebrief={serverPendingDebrief}
          recovery={recovery}
          initialLogging={initialLogging}
        />

        {/* Day one: the debrief promise — sell it before it exists */}
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

        {/* Footer: feedback link */}
        <p className="text-center text-[11px] text-stone-400 pb-20">
          <a href="mailto:feedback@careerrai.com" className="hover:text-stone-600 transition-colors">
            Help us improve · Give feedback
          </a>
        </p>
      </div>
    </div>
  );
}
