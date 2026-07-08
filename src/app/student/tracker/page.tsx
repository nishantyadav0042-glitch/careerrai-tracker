import { redirect } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthUser } from '@/lib/auth';
import { DailyTrackerApp } from '@/components/DailyTracker/DailyTrackerApp';
import { UrgentHelpBanner } from './urgent-help-banner';
import { getLogDateString } from '@/lib/streak-utils';
import { isPremium } from '@/lib/access';
import { LockedBuddyCard } from '@/components/locked-buddy-card';
import { TodaysRoutineCard } from '@/components/DailyTracker/TodaysRoutineCard';
import { RecommendedBuddies } from '@/components/recommended-buddies';
import { BuddyBanner } from '@/components/buddy-banner';
import { getRecommendedBuddiesForStudent } from '@/lib/buddy-match';
import { computePrepMemory } from '@/lib/prep-memory-data';
import { selectBuddyBanner } from '@/lib/buddy-banner';
import { computeTodaysFocus } from '@/lib/signal-engine';
import type { StreakData } from '@/types';

export const metadata = {
  title: 'CareerRai',
  description: 'Your CAT prep command centre',
};

// One dominant answer, not a dashboard of equal-weight cards: what should I
// study, given almost the whole first screen. Am I okay (Health) shrinks to
// a header chip, is this working (proof line) shrinks to one sentence, and
// the buddy nudge only ever shows one line at a time — nothing on this page
// is allowed to compete with Today's Study Plan for attention.

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
    { prepMemory, weeklyEvolution, healthScore, signals, revisionDueCount },
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

  // One recommended mentor — trust first, then the offer.
  const recommendedBuddies = (!buddyId && !isPremiumUser)
    ? (await getRecommendedBuddiesForStudent(admin, user.id)).slice(0, 1)
    : [];

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
  // One proof line: the tasks-completed week diff, already computed.
  const proofLine = weeklyEvolution.find((l) => l.startsWith('Tasks completed')) ?? null;
  // Sunday Review — the weekly heartbeat. IST Sunday only, real diffs only.
  const isSundayIST = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' }) === 'Sun';
  const sundayLines = isSundayIST ? weeklyEvolution.slice(0, 3) : [];

  // Am I okay? — folded into the header as a small chip instead of its own
  // card. It's real, and worth one glance, but it was competing for the same
  // "do something now" attention as the routine right below it — a
  // dashboard reflex, not a companion one. Full breakdown still lives on
  // My CAT Plan for anyone who wants it.
  let healthChip: { emoji: string; score: number } | null = null;
  if (healthScore.status === 'ready' && healthScore.score != null) {
    healthChip = {
      score: healthScore.score,
      emoji: healthScore.score >= 75 ? '🟢' : healthScore.score >= 50 ? '🟡' : '🔴',
    };
  }

  // Today's Focus — the one sentence that comes before anything else. Not a
  // dashboard fact; a decision. Reuses the same signals computed for the
  // Buddy's Preparation DNA (avoid_<section>, revision backlog, mock
  // cadence) rather than inventing a second definition of "behind."
  const avoidedSectionSignal = signals.find((s) => s.key.startsWith('avoid_'));
  const avoidedSection = avoidedSectionSignal
    ? (avoidedSectionSignal.key.replace('avoid_', '') as 'VARC' | 'DILR' | 'QA')
    : null;
  const todaysFocus = computeTodaysFocus({
    revisionDueCount,
    avoidedSection,
    hasStartedMocks: prepMemory.mockTrend.count > 0,
    mocksThisWeek: prepMemory.last7.mocksLogged,
    daysStudiedLast30: prepMemory.last30.daysStudied,
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white p-4 sm:p-6">
      <div className="max-w-md mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
            {greeting} {firstName} 👋
          </h1>
          {healthChip && (
            <Link href="/student/blueprint" className="shrink-0 text-sm font-semibold text-stone-500">
              {healthChip.emoji} {healthChip.score}%
            </Link>
          )}
        </div>

        {/* Today's Focus — one sentence, one decision, before anything else.
            Everything below this line is detail; this line is the verdict. */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-orange-600 mb-1">Today&apos;s Focus</p>
          <p className="text-lg font-bold text-stone-900">{todaysFocus.headline}</p>
          <p className="text-sm text-stone-600 mt-0.5">{todaysFocus.sub}</p>
        </div>

        {/* What should I study? — the reason the student opened the app,
            given the most room on the first screen. */}
        <TodaysRoutineCard />

        {/* Revenue driver — the one recurring conversion nudge on Home. Which
            banner shows is picked from the student's own behavior (a dropped
            mock, revision piling up, sustained consistency) rather than a
            timer — it changes because the student changed, not because a
            few seconds passed. */}
        {!buddyId && !isPremiumUser && <BuddyBanner banner={buddyBanner} />}

        {buddyId && (
          <UrgentHelpBanner buddyId={buddyId} hasPendingRequest={hasPendingRequest} />
        )}

        {/* Weekly progress — Sunday gets the fuller review; every other day
            gets the same fact in one quiet line. Never its own shouting card. */}
        {sundayLines.length > 0 ? (
          <div className="rounded-2xl bg-stone-900 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-orange-400 mb-2">Sunday Review</p>
            <ul className="space-y-1.5">
              {sundayLines.map((line) => (
                <li key={line} className="text-sm text-white flex gap-2"><span className="text-teal-400">✓</span>{line}</li>
              ))}
            </ul>
            {!buddyId && !isPremiumUser && (
              <a href="/student/buddy" className="mt-3 block text-xs font-semibold text-orange-400">
                Want an IIM mentor to review this week? →
              </a>
            )}
          </div>
        ) : proofLine && (
          <p className="text-xs text-stone-500 px-1">📈 {proofLine}</p>
        )}

        {/* One mentor. Trust first, offer second. */}
        {!buddyId && !isPremiumUser && (
          recommendedBuddies.length > 0
            ? <RecommendedBuddies buddies={recommendedBuddies} studentName={profile?.full_name ?? undefined} />
            : <LockedBuddyCard streak={(streakRow?.current_streak as number | null) ?? 0} fullName={profile?.full_name ?? undefined} />
        )}

        {!buddyId && isPremiumUser && (
          <div className="rounded-2xl bg-teal-50 px-4 py-3">
            <div className="flex items-center gap-3">
              <Image src="/buddy-logo.jpg" alt="CareerRai Buddy" width={40} height={40} className="rounded-full shrink-0 object-cover" />
              <p className="text-sm text-teal-900">
                <strong>Your buddy is being matched.</strong> Log today — data makes their guidance sharp.
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
