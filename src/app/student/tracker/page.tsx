import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthUser } from '@/lib/auth';
import { DailyTrackerApp } from '@/components/DailyTracker/DailyTrackerApp';
import { getLogDateString, momentumStreak } from '@/lib/streak-utils';
import { MomentumShieldIntro } from '@/components/momentum-shield-intro';
import { StreakRestoreButton } from '@/components/streak-restore-button';
import { InsightCloud } from '@/components/insight-cloud';
import { CoachingMirror } from '@/components/coaching-mirror';
import { homeOrder, daySlot, slotGreeting, type HomeBlock } from '@/lib/day-slot';
import { NextActionCard } from '@/components/next-action-card';
import { DailyChallengeCard } from '@/components/daily-challenge-card';
import { DailyPickTeaser } from '@/components/home/daily-pick-teaser';
import { InsightBubble } from '@/components/home/insight-bubble';
import { computeDailyInsight } from '@/lib/daily-insight';
import { Shield } from 'lucide-react';
import { TodaysRoutineCard } from '@/components/DailyTracker/TodaysRoutineCard';
import { SetPasswordReminder } from '@/components/set-password-reminder';
import { InstallButton } from '@/components/install/install-button';
import { PaceCard } from '@/components/home/pace-card';
import { TopicStats } from '@/components/home/topic-stats';
import { ImportantDates } from '@/components/home/important-dates';
import { remainingSyllabusHours, remainingMockHours, computeRequiredPace } from '@/lib/study-pace';
import { computeTopicMemory, buildCompletionRecords } from '@/lib/prep-memory-data';
import { getStudentProfile } from '@/lib/student-profile';
import { projectSyllabusFinish } from '@/lib/study-plan';
import { catExamDate } from '@/lib/routine-engine';
import { TOPIC_METADATA } from '@/lib/topics-constants';
import { Flame, CalendarCheck } from 'lucide-react';
import { AppTour } from '@/components/app-tour';
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
  // Progress % is counted BY NUMBER OF TOPICS (founder decision, 23 Jul), the
  // same definition My CAT Plan uses (studiedOnceCount = practicing/revising/
  // exam_ready over all 46), so the Home ring and Blueprint can never show
  // different percentages. The hours model still drives the pace/finish-date
  // (requiredPerDay, ahead/behind) below — only the displayed % is by count.
  const completedByTopics = totalTopics > 0 ? Math.round(((totalTopics - remainingTopics) / totalTopics) * 100) : 0;
  const pace = targetIso
    ? {
        ...computeRequiredPace({
          remainingHours: paceRemainingHours,
          mockHours: remainingMockHours(paceRemainingHours),
          today: now,
          targetDate: new Date(targetIso + 'T00:00:00'),
          committedPerDay: (profile?.study_target_hours as number | null) ?? null,
        }),
        completedPct: completedByTopics,
      }
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
  const hoursByDate = new Map((logs ?? []).map((l) => [l.report_date, Number(l.study_duration) || 0]));
  const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const week: number[] = [];
  const weekLabels: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayDate.getTime() - i * 86_400_000);
    week.push(hoursByDate.get(d.toISOString().split('T')[0]) ?? 0);
    weekLabels.push(WEEKDAY[d.getUTCDay()]);
  }

  // The three anchor dates, corrected (founder, 20 July — matches how CAT prep
  // actually works and what the routine engine already does):
  // * Syllabus — the student's own target date.
  // * Mocks — weekly from AUGUST (AIMCAT/SIMCAT season opens then), NOT "day
  //   after syllabus ends". Serious aspirants run one mock a week alongside
  //   syllabus and ramp up near the exam; waiting for a finished syllabus is a
  //   classic mistake the app must not encode.
  // * Revision — ROLLING: it begins the moment the first topics are studied
  //   (the engine's spaced revision-due scheduling already works this way);
  //   showing "8 Nov" made revision look like a far-away phase instead of a
  //   daily habit. The final 3-week consolidation still happens — inside the
  //   plan — but the anchor strip now tells the truth: revision is continuous.
  const fmtDM = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const syllabusLabel = targetIso ? fmtDM(new Date(targetIso + 'T00:00:00')) : '—';
  const mockSeasonStart = new Date(examYear, 7, 1); // 1 Aug of the CAT year
  const mockLabel = now >= mockSeasonStart ? 'Every week' : `Starts ${fmtDM(mockSeasonStart)}`;
  // Revision season (founder, 21 July): structured revision opens 1 September
  // — high-weightage topics first (the selector's September boost drives the
  // actual plan; see topic-selector.ts). Before that the engine still cycles
  // studied topics via spaced revision, but the anchor speaks the season.
  const revSeasonStart = new Date(examYear, 8, 1); // 1 Sep
  const revLabel = now >= revSeasonStart ? 'Daily · weighted' : `Starts ${fmtDM(revSeasonStart)}`;

  // Topics still untouched (not started) — the third "where you stand" number.
  const untouchedTopics = Math.max(0, totalTopics - startedOnceCount - learningCount);

  // Rotating home, four times a day (see lib/day-slot.ts). The student's
  // question changes with the clock — "what's today" at 7am, "did I log it" at
  // midnight — and a fixed layout answers the wrong one most of the time.
  const istHour = Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }));
  const slot = daySlot(istHour);
  const blockOrder = homeOrder(istHour);

  const nextSession = sessions?.[0] ?? null;
   
  const todaySession =
    // eslint-disable-next-line react-hooks/purity -- server component, per-request "now" is correct here
    nextSession && new Date(nextSession.scheduled_at).getTime() - Date.now() < 24 * 3_600_000
      ? nextSession
      : null;

  // Momentum Shield display: same shield/decay math the streak RPC applies at
  // the next log, so the number shown mid-miss is exactly what gets persisted.
  const momentum = momentumStreak(
    streakRow?.current_streak,
    (streakRow as StreakData | null)?.shields,
    streakRow?.last_log_date ?? null
  );
  const currentStreak = momentum.streak;

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

  // First-run sequence in the INSTALLED app (founder): app tour FIRST, then the
  // "switch on notifications" ask right after it finishes. So the tour only
  // needs the app installed and onboarding/post-signup settled — it must NOT
  // wait for push (push is what we ask for AT THE END of the tour). It must
  // never run in a browser tab or over the reminders screen; the component adds
  // a standalone-display-mode guard, and the notification ask holds back until
  // the tour is complete.
  const tourReady =
    profile?.app_installed === true &&
    profile?.onboarding_completed === true &&
    profile?.post_signup_done === true;

  // The two rotating blocks. In the morning/day the plan leads (what to study);
  // in the evening the log leads (did you do it). Defined once, ordered below.
  const logBlock = (
    <DailyTrackerApp
      studentId={user.id}
      todaySession={todaySession}
      hasBuddy={!!buddyId}
      initialPendingDebrief={serverPendingDebrief}
      initialLogging={initialLogging}
      hasLoggedYesterday={hasLoggedYesterday}
      yesterdayStr={yesterdayStr}
      yesterdayLabel={yesterdayLabel}
      firstLogNudge={(logs ?? []).length === 0}
    />
  );
  const planBlock = <TodaysRoutineCard />;

  // ── Day-1 insight (founder, 21 July): the FIRST thing shown in the
  // installed app is VALUE — "where you lack as of today", straight from the
  // student's own coverage matrix. Weakest section by gap ratio (untouched
  // count double-weighted vs in-progress, ties DILR → QA → VARC — same
  // deterministic default as the plan engine), plus the highest-weightage
  // untouched topics in it as "start here". Never invented: all counts come
  // from topicMemory.
  const SECTIONS: Array<'QA' | 'VARC' | 'DILR'> = ['QA', 'VARC', 'DILR'];
  const bySection = SECTIONS.map((sec) => {
    const entries = topicMemory.filter((t) => TOPIC_METADATA[t.topic]?.section === sec);
    const studied = entries.filter((t) => t.status === 'practicing' || t.status === 'revising' || t.status === 'exam_ready').length;
    const untouchedN = entries.filter((t) => t.status === 'not_started').length;
    const inProg = entries.filter((t) => t.status === 'learning').length;
    // "Remaining" = untouched + still-in-learning — a topic merely opened is
    // NOT done (21 July fix: "0 of 28 untouched" while 8/28 studied read as
    // nonsense; the honest gap for a section is everything not yet finished).
    const remaining = untouchedN + inProg;
    const gap = entries.length ? (untouchedN * 2 + inProg) / entries.length : 0;
    return { name: sec, studied, total: entries.length, untouchedN, remaining, gap };
  });
  const tieOrder: Record<string, number> = { DILR: 0, QA: 1, VARC: 2 };
  const weakestSec = [...bySection].sort((a, b) => b.gap - a.gap || tieOrder[a.name] - tieOrder[b.name])[0];
  const insightFresh = bySection.every((s) => s.studied === 0 && s.total - s.untouchedN === 0);
  // Today's insight ON the home screen (founder: in-app, not just push) —
  // same rule engine as the 5 PM notification, topicMemory reused from this
  // page's own computation. Null (fewer than 2 logged days) renders nothing.
  const dailyInsight = (logs ?? []).length >= 2
    ? await computeDailyInsight(admin, user.id, archetype, { topicMemory }).catch(() => null)
    : null;

  return (
    <div className="bg-stone-50 px-1 pb-4">
      <div className="mx-auto flex max-w-md flex-col gap-1.5">
        {/* New Mastery plans — gated per section to opted-in test accounts
            (profiles.<section>_model_enabled). Everyone else never sees these. */}
        {profile?.qa_model_enabled && (
          <Link href="/student/plan/qa"
            className="flex items-center justify-between gap-3 rounded-2xl bg-stone-900 px-4 py-3 text-white shadow-sm transition-colors hover:bg-stone-800">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-orange-300">New · Quant Mastery</p>
              <p className="text-sm font-bold leading-snug">Open your topic-by-topic Quant plan →</p>
            </div>
            <span className="shrink-0 text-2xl" aria-hidden>🧗</span>
          </Link>
        )}
        {profile?.dilr_model_enabled && (
          <Link href="/student/plan/dilr"
            className="flex items-center justify-between gap-3 rounded-2xl bg-stone-900 px-4 py-3 text-white shadow-sm transition-colors hover:bg-stone-800">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-violet-300">New · DILR Mastery</p>
              <p className="text-sm font-bold leading-snug">Open your topic-by-topic DILR plan →</p>
            </div>
            <span className="shrink-0 text-2xl" aria-hidden>🧩</span>
          </Link>
        )}
        {profile?.varc_model_enabled && (
          <Link href="/student/plan/varc"
            className="flex items-center justify-between gap-3 rounded-2xl bg-stone-900 px-4 py-3 text-white shadow-sm transition-colors hover:bg-stone-800">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-sky-300">New · VARC Mastery</p>
              <p className="text-sm font-bold leading-snug">Open your topic-by-topic VARC plan →</p>
            </div>
            <span className="shrink-0 text-2xl" aria-hidden>📖</span>
          </Link>
        )}
        {/* Greeting + streak card */}
        <div className="flex items-center justify-between gap-3 px-1">
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-stone-900">
              Hello, {firstName}! <span aria-hidden>👋</span>
            </h1>
            {/* Moves with the slot, so the page reads like it knows the hour. */}
            <p className="text-[13px] text-stone-500">{slotGreeting(slot)}</p>
          </div>
          {/* Streak is a status display, not a link — tapping it used to open
              the Analysis page, which made no sense (founder, 24 Jul). */}
          <div className="flex shrink-0 items-center gap-1.5 rounded-2xl border border-stone-200/70 bg-white px-3 py-2 shadow-sm">
            <Flame className={currentStreak > 0 ? 'h-5 w-5 text-orange-500' : 'h-5 w-5 text-stone-300'} />
            <div className="leading-none">
              <div className="text-lg font-extrabold text-stone-900 tabular-nums">{currentStreak}</div>
              <div className="text-[10px] font-medium text-stone-500">day streak</div>
            </div>
            <span className="ml-0.5 inline-flex items-center gap-0.5 rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] font-bold text-stone-600">
              <Shield className="h-3 w-3" />{momentum.shields}
            </span>
          </div>
        </div>

        {/* Streak restore (founder, 23 Jul): shields no longer auto-cover a
            miss. A broken streak shows a Restore button the student taps
            themselves (Snapchat-style); out of shields → one honest line. */}
        {momentum.broken && momentum.canRestore && (
          <StreakRestoreButton streak={momentum.restorable} shields={momentum.shields} />
        )}
        {momentum.broken && !momentum.canRestore && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800">
            <Flame className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              Your streak broke and you&apos;re out of shields. No stress — log today and start a fresh one. Earn a shield back every 21 days.
            </p>
          </div>
        )}

        {/* The rotating block. Same four cards every day; the order is decided
            by the hour (lib/day-slot.ts) so the top of Home answers whatever
            the student is actually asking right now:
              action   — what to do next
              log      — record what happened
              insight  — yesterday's pattern (and the install hook in a browser)
              coaching — their coaching's daily share, or the upload entry */}
        {blockOrder.map((b: HomeBlock) => {
          if (b === 'action') return (
            /* The challenge rides directly under the action card in every
               slot: both answer "what can I do right now", and the challenge
               is the 2-minute version for a student who can't start a block. */
            <div key="action" className="space-y-3">
              <NextActionCard />
              <DailyChallengeCard />
            </div>
          );
          if (b === 'log') return <div key="log">{logBlock}</div>;
          if (b === 'coaching') return <CoachingMirror key="coaching" />;
          /* The insight's old slot now points at Daily Pick — the community
             stays OFF Home (founder, 25 Jul); the insight itself floats by as
             a 7-second cloud below. */
          return <DailyPickTeaser key="insight" />;
        })}

        {/* The daily insight, as a passing 7-second cloud. */}
        {dailyInsight && <InsightBubble title={dailyInsight.title} text={dailyInsight.text} />}

        {/* Progress card — % done, pace, weekly trend, reschedule. */}
        {pace && targetIso && <PaceCard pace={pace} targetIso={targetIso} week={week} weekLabels={weekLabels} />}

        {/* Important dates — syllabus / mocks / revision */}
        {targetIso && <ImportantDates syllabus={syllabusLabel} mocks={mockLabel} revision={revLabel} />}

        {/* Where you stand — covered / in progress / untouched */}
        <TopicStats covered={startedOnceCount} inProgress={learningCount} untouched={untouchedTopics} />

        {/* Fallback pace strip only when there's no ring (no target date yet). */}
        {!pace && finishStrip && (
          <Link
            href="/student/blueprint"
            className={
              'flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-semibold transition-colors ' +
              (finishStrip.tone === 'critical'
                ? 'border-stone-900 bg-stone-900 text-white hover:bg-stone-800'
                : finishStrip.tone === 'tight'
                  ? 'border-stone-300 bg-stone-100 text-stone-900 hover:bg-stone-200'
                  : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50')
            }
          >
            <CalendarCheck className="h-4 w-4 shrink-0" />
            <span className="min-w-0 truncate">{finishStrip.label}</span>
          </Link>
        )}

        {showPasswordReminder && <SetPasswordReminder notifPrefs={notifPrefs} />}

        {/* Install card (browser only; hides itself in the installed app) */}
        <div className="empty:hidden"><InstallButton variant="card" /></div>

        {/* Daily study plan (what to study, with swap) */}
        {planBlock}

        {/* During the day, the log sits under the plan. */}
      </div>
      {/* One-time spotlight tour of the home screen (Plan → Swap → Log → Buddy).
          Gated: installed app only, after onboarding + reminders are settled. */}
      <AppTour enabled={tourReady} />
      {/* One-time Momentum Shield briefing — existing loggers only (their past
          streak was restored under the new rules; new students just live with
          shields from day one). */}
      <MomentumShieldIntro streak={momentum.streak} shields={momentum.shields} enabled={(logs ?? []).length > 0} />
      {/* First-run insight — now the LAST beat (founder, 23 Jul): a tiny
          corner cloud with a 4-5 word insight for ~4.5s, AFTER notifications
          and the tour. Replaces the old full-screen Day-1 insight. */}
      {tourReady && (
        <InsightCloud weakest={weakestSec.name} fresh={insightFresh} />
      )}
    </div>
  );
}
