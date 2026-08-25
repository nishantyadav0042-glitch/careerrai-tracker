import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { studyDayString } from '@/lib/study-day';
import { getAuthUser } from '@/lib/auth';
import { StudentBottomNav } from '@/components/bottom-nav';
import { NotificationBell } from '@/components/notification-bell';
import { Logo } from '@/components/logo';
import { Badge } from '@/components/ui/badge';
import { getChatUnreadCount, getNotifUnreadCount } from '@/lib/chat-unread';
import PostSignupSequence from '@/components/post-signup-sequence';
import { InstallPing } from '@/components/install-ping';
import { StandaloneNotifAsk } from '@/components/standalone-notif-ask';
import { getStudentProfile } from '@/lib/student-profile';
import { DailyBuddyNudge } from '@/components/daily-buddy-nudge';
import { InstallJourney } from '@/components/install-journey';
import { PushHealer } from '@/components/push-healer';
import { NotificationAttribution } from '@/components/notification-attribution';
import { pushHealth } from '@/lib/push-state';
import { OnboardingGate } from './onboarding/onboarding-gate';
import { StoreBuildDetector } from '@/components/store-build-detector';
import { TimetablePrompt } from '@/components/timetable-prompt';
import { CrashReporter } from '@/components/crash-reporter';
import { SessionLossNotice } from '@/components/session-loss-notice';
import { BuddyDemoTour } from '@/components/buddy-demo-tour';
import { CoverageReviewGate } from '@/components/coverage-review-gate';
import { isReviewDue } from '@/lib/coverage-review';

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const [chatUnread, notifUnread, profile] = await Promise.all([
    getChatUnreadCount(user.id, 'student'),
    getNotifUnreadCount(user.id),
    getStudentProfile(user.id),
  ]);

  // Route non-students to their own home (handles stale role cookies too).
  // Only redirect when the profile actually loaded — a transient null read must
  // degrade to rendering (the old fast path did), never bounce to /login, which
  // the proxy would send straight back here → an infinite redirect loop.
  if (profile?.role === 'admin') redirect('/admin');
  if (profile?.role === 'buddy') redirect('/buddy/home');
  // Any other non-student role (e.g. 'sales') → the authoritative router at
  // '/', NEVER '/login': a logged-in user sent to /login is bounced straight
  // back here by the proxy, which is the infinite-redirect loop. '/' does a DB
  // role lookup and lands them on their real home.
  if (profile && profile.role !== 'student') redirect('/');

  // Buddy demo account = the guided tour and NOTHING else (founder, 4 Aug:
  // "in this ID just keep the tour only"). Every growth prompt, gate and
  // nudge below is suppressed for it — a buddy touring the student side must
  // never be interrupted by the timetable ask, coverage review, install
  // journey, buddy pitch or push asks. The tour overlay is the one guide.
  const isBuddyDemo = profile?.username === 'buddydemo';

  // Login → Blueprint Builder, nothing in between. Its own intro screen is
  // the one hero the founder wants; the old FirstLoginTour was a second,
  // redundant hero in front of it and is gone. The Builder stays until
  // completed — no skip, no dismiss.
  const showOnboarding = profile?.onboarding_completed !== true && !isBuddyDemo;

  // Push, reordered: the FIRST ask now fires as early as possible — right
  // after login, before onboarding — because reach beats conversion rate
  // here (far more students reach this screen than ever finish the
  // Builder, so even a lower accept rate nets more push-enabled students
  // overall). Optional, never blocking: declining lets them straight into
  // onboarding, because the highest-value student is the one who finishes
  // it, not the one who granted push. A SECOND, gentler ask fires once,
  // only if they declined the first time and have since finished
  // onboarding — backed by something real they now have ("your plan is
  // ready") instead of a cold request. Decline that one too and it's over.
  const notifPrefs = (profile?.notif_prefs as Record<string, unknown> | null) ?? {};
  const pushEnabled = notifPrefs.push === true;
  // One vocabulary for "is this student actually receiving reminders".
  //
  // This used to be open-coded here as `!pushEnabled || !push_subscription`,
  // and the profile screen spelled the same rule a different (wrong) way — it
  // read the PREFERENCE and showed 42 students an ON toggle while they received
  // nothing for an average of 18 days. Same rule, two spellings, one of them
  // silently false. Both now ask lib/push-state.
  const push = pushHealth({
    prefWantsPush: pushEnabled,
    hasSubscription: !!profile?.push_subscription,
    diedAt: (profile?.push_died_at as string | null) ?? null,
  });
  // The post-signup sequence now needs NO server data: it shows the six
  // things we do, then asks for reminders. It used to recompute the finish
  // date here and re-open that decision, which silently overwrote the date
  // students had already picked in onboarding — that whole compute is gone
  // (founder, 8 Aug: the first screen tells them what we do, nothing else).
  const showPostSignup = !showOnboarding && profile?.post_signup_done !== true && !isBuddyDemo;

  // Daily "try a buddy" nudge — only for students with no buddy yet and not
  // premium, and only once no higher-priority modal is up. The component itself
  // throttles to once per calendar day.
  const noBlockingModal = !showOnboarding && !showPostSignup && !isBuddyDemo;
  // Fix #1 (activation): install is the finish line, gated on the authoritative
  // app_installed flag. For a plan-built student who genuinely hasn't installed,
  // the install journey shows every session (the component throttles to once per
  // session) and OUTRANKS the buddy nudge — no home-screen icon is the #1 reason
  // daily logs never happen, so nothing competes with it until the app is on the
  // phone. Once app_installed is true, the buddy nudge takes the slot again.
  const appInstalled = profile?.app_installed === true;
  // eslint-disable-next-line react-hooks/purity -- server component, per-request "now" is correct here
  const nowMs = Date.now();

  // The weekly coverage review — mandatory for EVERY student, coaching or not.
  // Blueprint, pace ring, revision queue, daily insight and the coaching mirror
  // all read topic_coverage; a matrix filled once at onboarding and never
  // revisited makes every one of them confidently wrong. Because it's required,
  // it outranks the optional nudges below and they stand down while it's up.
  // The 4th argument is the fix for the daily nag: coverage is filled during
  // onboarding, so onboarding IS the first review. Without it, every student
  // who had not yet submitted a review saw this on every single app open.
  const showCoverageReview = isReviewDue(
    profile?.coverage_reviewed_at as string | null,
    profile?.onboarding_completed === true,
    new Date(nowMs),
    (profile?.onboarding_last_activity_at as string | null) ?? (profile?.created_at as string | null),
  ) && noBlockingModal;

  const showInstallJourney = noBlockingModal && !showCoverageReview && !appInstalled;

  // Coaching timetable, offered in the first 2 days only. A timetable shapes
  // the plan from the start; asking a month in is just another popup. Skipped
  // entirely once one is saved, so it can never re-ask a student who already
  // uploaded (the client-side decline flag only covers one device).
  const accountAgeDays = profile?.created_at
    ? (nowMs - Date.parse(profile.created_at as string)) / 86_400_000
    : 99;
  // Coaching students only. A self-study student has no coaching timetable to
  // upload, so asking them is pure noise (founder: "who says no, don't give
  // them the option"). coaching_enrolled === false means they answered No in
  // the /start funnel; null means never asked, so we still offer it.
  let showTimetablePrompt = false;
  // Free for every student since 8 Aug (the machine is free, the human is
  // paid) — the premium check that used to sit here was a leftover from the
  // one day this feature was gated, and it silently kept the best day-1 wow
  // away from every free coaching student.
  if (noBlockingModal && !showCoverageReview && appInstalled && accountAgeDays <= 2 && profile?.coaching_enrolled !== false) {
    const { data: tt } = await admin
      .from('student_timetables').select('student_id').eq('student_id', user.id).maybeSingle();
    showTimetablePrompt = !tt;
  }

  // Buddy nudge stands down while the timetable ask is live — one auto-modal a
  // day is the rule, and in the first 2 days the timetable is the better use of
  // that single slot.
  //
  // AND IT STANDS DOWN ON THE STUDY DAY ONBOARDING FINISHED (founder, 26 Aug):
  // the journey's last screen is now the sample insight — "log daily and
  // CareerRai shows you things about yourself" — and the nudge was wired to
  // fire 1.4s after that very moment. A sales modal stacked onto the insight
  // is the exact sequence the retention principle forbids: Buddy is a
  // conversion opportunity, not a recurring interruption, and day 0 belongs
  // to the habit loop. Flows that DO pitch during onboarding already consume
  // the day via the promo claim; this covers the flows that don't, so no
  // path ends its first insight staring at a checkout.
  const onboardedTodayIst = (() => {
    const at = (profile?.onboarding_last_activity_at as string | null) ?? null;
    return at != null && at.slice(0, 10) === studyDayString();
  })();
  const showBuddyNudge = noBlockingModal && !showCoverageReview && appInstalled && !showTimetablePrompt
    && !onboardedTodayIst && !profile?.buddy_id && profile?.is_premium !== true;

  return (
    <div className="min-h-screen bg-stone-50">
      {/* serverPushDead: the send path flagged this student's subscription as
          gone (410/404) — or we've never held one despite the client possibly
          having permission. Either way the healer must mint a FRESH sub, not
          re-upload whatever stale one the browser still returns. */}
      {/* Crash capture + install-source stamp. A JS error in a TWA is
          invisible to Play Console and Crashlytics; this is the only way we
          hear about a broken screen before a 1-star review does. */}
      <CrashReporter />
      {/* One listener for every student route — mounting it per page would
          stack duplicate notices on navigation. */}
      <SessionLossNotice />
      {/* Buddy demo overlay: banner + guided tour, keyed off the cr_demo
          cookie set at login for buddydemo@careerrai.in. Renders null for
          everyone else. */}
      <BuddyDemoTour />
      {/* Two different questions, deliberately two different flags (see
          push-healer.tsx's own header for the production incident that
          forced the split): serverPushDead decides whether to ROTATE the
          endpoint; inRecoveryQueue decides whether this run counts as a
          RECOVERY worth recording — which requires the student to have
          actually granted permission, not merely to lack a subscription. */}
      <PushHealer
        serverPushDead={!!profile?.push_died_at || !profile?.push_subscription}
        inRecoveryQueue={
          (profile?.notif_prefs as Record<string, unknown> | null)?.push === true && !profile?.push_subscription
        }
      />
      <NotificationAttribution />
      <InstallPing />
      <StoreBuildDetector />
      <div className="max-w-2xl mx-auto px-3 pt-2 pb-16">
        <div className="flex items-center justify-between mb-2">
          <Logo />
          <div className="flex items-center gap-2">
            <Badge color="stone">Student</Badge>
            <NotificationBell userId={user.id} initialUnreadCount={notifUnread} />
          </div>
        </div>
        {children}
      </div>
      <StudentBottomNav chatUnread={chatUnread} />
      {/* Onboarding gate (restored, audit 24 Jul). /start is the primary funnel
          and marks onboarding_completed=true, so a /start student NEVER reaches
          this branch — no "third date ask" regression. It fires ONLY for a
          student who arrives un-onboarded (signed up via /login, or an
          admin/allowlist-provisioned account): previously they landed on a bare
          tracker with no plan and nothing to fix it. The modal sets
          onboarding_completed on completion, so it can't trap anyone. It also
          revives the repeater ₹999 pitch, which lives inside this modal. */}
      {showOnboarding ? (
        <OnboardingGate />
      ) : showPostSignup ? (
        <PostSignupSequence regEventId={user.id} />
      ) : isBuddyDemo ? null : push !== 'healthy' ? (
        // Permission architecture (22 July): the notification permission is
        // requested ONLY inside the installed app, right after the first Career
        // Insight — StandaloneNotifAsk renders solely in standalone mode and
        // returns null in a browser tab. The old browser PushGate asks are gone
        // for students: production data showed browser-context subscriptions
        // dying at ~75% vs ~8% for installed-app ones, so we no longer mint a
        // subscription anywhere but its permanent home. StandaloneNotifAsk also
        // fires when prefs say push=ON but the server holds no live
        // subscription (the reconnect case).
        <StandaloneNotifAsk pushEnabled={pushEnabled} serverSubDead={!profile?.push_subscription} />
      ) : null}
      {showInstallJourney && <InstallJourney appInstalled={appInstalled} planReady={!showOnboarding} />}
      {showCoverageReview && <CoverageReviewGate />}
      {showTimetablePrompt && <TimetablePrompt />}
      {/* One-time evidence announcement (founder, 25 Jul). Established
          students only: a day-1 student is already meeting the log for the
          first time, and the timetable ask owns the early-days slot. All
          three prompts share claimDailyModal, so at most one fires per day
          regardless. */}
      {/* EvidenceAnnounce removed 22 Aug. It told every student older than two
          days: "New: log your correct answers — After you finish a topic, tell
          us two numbers… Your progress then shows what you can actually score
          on, not just what you've read." Its only button was "Got it", and
          there was nowhere to go: the capture UI (evidence-capture.tsx) was
          deleted on 14 Aug as an orphan — correctly, since nothing imported it
          any more — while the announcement for it kept shipping.
          We were advertising the one capability this product does not have, to
          the students who most needed it. Zero real students have ever logged a
          practice outcome; POST /api/evidence has no client caller at all.
          The promise comes down until the capture goes back up. */}
      {showBuddyNudge && <DailyBuddyNudge fullName={profile?.full_name ?? undefined} />}
    </div>
  );
}
