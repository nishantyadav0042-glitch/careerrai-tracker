import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthUser } from '@/lib/auth';
import { DailyTrackerApp } from '@/components/DailyTracker/DailyTrackerApp';
import { UrgentHelpBanner } from './urgent-help-banner';
import { getLogDateString } from '@/lib/streak-utils';
import { isPremium } from '@/lib/access';
import { TodaysRoutineCard } from '@/components/DailyTracker/TodaysRoutineCard';
import { BuddyBanner } from '@/components/buddy-banner';
import { computePrepMemory } from '@/lib/prep-memory-data';
import { selectBuddyBanner } from '@/lib/buddy-banner';
import type { StreakData } from '@/types';

export const metadata = {
  title: 'CareerRai',
  description: 'Your CAT prep command centre',
};

// Home answers exactly two questions: what should I study, and should I
// talk to a Buddy. Everything else — health, weekly trends, mocks, revision
// analytics, recommended mentors — lives on My CAT Plan or the Buddy tab,
// not here. A widget earns a place on this page only if it answers one of
// those two questions; if it doesn't, it moved.
export default async function DailyTrackerPage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString().split('T')[0];

  // Profile fetched first — computePrepMemory needs its archetype fields as input.
  const { data: profile } = await admin
    .from('profiles')
    .select('full_name, buddy_id, is_premium, is_demo, is_repeater, is_working_professional, created_at')
    .eq('id', user.id).single();

  const [
    { data: sessions },
    { data: pendingReqs },
    { data: logs },
    { data: recentMock },
    { data: streakRow },
    { prepMemory },
  ] = await Promise.all([
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
    computePrepMemory(
      admin, user.id,
      { isRepeater: !!profile?.is_repeater, isWorkingProfessional: !!profile?.is_working_professional },
      (profile?.created_at as string | null)?.split('T')[0] ?? null
    ),
  ]);

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there';
  const buddyId = profile?.buddy_id ?? null;
  const isPremiumUser = isPremium(profile);
  const buddyBanner = selectBuddyBanner({
    mocksCount: prepMemory.mockTrend.count,
    latestPercentile: prepMemory.mockTrend.latestPercentile,
    previousPercentile: prepMemory.mockTrend.previousPercentile,
    daysStudiedLast30: prepMemory.last30.daysStudied,
    isRepeater: !!profile?.is_repeater,
    isWorkingProfessional: !!profile?.is_working_professional,
  });

  // Second batch — buddy identity + existing debrief, only when relevant.
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

  const hour = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false });
  const h = parseInt(hour);
  const greeting = h < 4 ? 'Late night' : h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';

  const nextSession = sessions?.[0] ?? null;
  const todaySession =
    nextSession && new Date(nextSession.scheduled_at).getTime() - Date.now() < 24 * 3_600_000
      ? nextSession
      : null;

  const hasPendingRequest = (pendingReqs?.length ?? 0) > 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white p-4 sm:p-6">
      <div className="max-w-md mx-auto space-y-6">
        <h1 className="text-xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
          {greeting} {firstName} 👋
        </h1>

        {/* Question 1: what should I study? */}
        <TodaysRoutineCard />

        {/* Close the loop — logging today's work, the session strip, and the
            debrief/feedback modals. Not decorative status; the input the
            rest of the app runs on. */}
        <DailyTrackerApp
          studentId={user.id}
          todaySession={todaySession}
          hasBuddy={!!buddyId}
          buddyId={buddyId}
          buddyName={buddyName}
          initialPendingDebrief={serverPendingDebrief}
          initialFeedback={initialFeedback}
          initialLogging={initialLogging}
          hasLoggedYesterday={hasLoggedYesterday}
          yesterdayStr={yesterdayStr}
          yesterdayLabel={yesterdayLabel}
        />

        {/* Question 2: should I talk to a Buddy? One slot, one answer — an
            urgent-help prompt for students who already have a Buddy, or the
            behavior-triggered nudge for students who don't. Never both. */}
        {buddyId
          ? <UrgentHelpBanner buddyId={buddyId} hasPendingRequest={hasPendingRequest} />
          : !isPremiumUser && <BuddyBanner banner={buddyBanner} />}

        <div className="pb-16" />
      </div>
    </div>
  );
}
