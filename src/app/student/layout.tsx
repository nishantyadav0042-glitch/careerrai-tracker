import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthUser } from '@/lib/auth';
import { StudentBottomNav } from '@/components/bottom-nav';
import { NotificationBell } from '@/components/notification-bell';
import { Logo } from '@/components/logo';
import { Badge } from '@/components/ui/badge';
import { getChatUnreadCount, getNotifUnreadCount } from '@/lib/chat-unread';
import PostSignupSequence from '@/components/post-signup-sequence';
import { InstallPing } from '@/components/install-ping';
import { StandaloneNotifAsk } from '@/components/standalone-notif-ask';
import { computeTopicMemory } from '@/lib/prep-memory-data';
import { remainingPrepHours, EXAM_UNIT_COUNT } from '@/lib/blueprint-builder';
import { remainingMockHours } from '@/lib/study-pace';
import { getStudentProfile } from '@/lib/student-profile';
import { DailyBuddyNudge } from '@/components/daily-buddy-nudge';
import { InstallJourney } from '@/components/install-journey';
import { PushHealer } from '@/components/push-healer';

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
  if (profile && profile.role !== 'student') redirect('/login');

  // Login → Blueprint Builder, nothing in between. Its own intro screen is
  // the one hero the founder wants; the old FirstLoginTour was a second,
  // redundant hero in front of it and is gone. The Builder stays until
  // completed — no skip, no dismiss.
  const showOnboarding = profile?.onboarding_completed !== true;

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
  // Permission architecture (22 July): students are NEVER asked for push in a
  // browser tab — only inside the installed app (StandaloneNotifAsk), after the
  // first Career Insight. The browser PushGate asks are retired for students;
  // the post-signup sequence no longer asks either. Only the hoursLeft compute
  // below runs, and only when the sequence is actually about to render.
  const showPostSignup = !showOnboarding && profile?.post_signup_done !== true;

  let postSignupProps: { targetIso: string | null; hoursLeft: number } | null = null;
  if (showPostSignup) {
    const archetype = { isRepeater: !!profile?.is_repeater, isWorkingProfessional: !!profile?.is_working_professional };
    const topicMemory = await computeTopicMemory(admin, user.id, archetype);
    const practicing = topicMemory.filter((t) => t.status === 'practicing' || t.status === 'revising' || t.status === 'exam_ready').length;
    const learning = topicMemory.filter((t) => t.status === 'learning').length;
    const syllabusLeft = remainingPrepHours({ coverage_total: topicMemory.length || EXAM_UNIT_COUNT, coverage_practicing: practicing, coverage_learning: learning });
    // Same formula as the ring: syllabus + mock budget, so the date the
    // student confirms here is the same date the ring holds them to.
    const hoursLeft = syllabusLeft + remainingMockHours(syllabusLeft);
    postSignupProps = {
      targetIso: (profile?.syllabus_target_date as string | null) ?? null,
      hoursLeft,
    };
  }

  // Daily "try a buddy" nudge — only for students with no buddy yet and not
  // premium, and only once no higher-priority modal is up. The component itself
  // throttles to once per calendar day.
  const noBlockingModal = !showOnboarding && !showPostSignup;
  // Fix #1 (activation): install is the finish line, gated on the authoritative
  // app_installed flag. For a plan-built student who genuinely hasn't installed,
  // the install journey shows every session (the component throttles to once per
  // session) and OUTRANKS the buddy nudge — no home-screen icon is the #1 reason
  // daily logs never happen, so nothing competes with it until the app is on the
  // phone. Once app_installed is true, the buddy nudge takes the slot again.
  const appInstalled = profile?.app_installed === true;
  const showInstallJourney = noBlockingModal && !appInstalled;
  const showBuddyNudge = noBlockingModal && appInstalled && !profile?.buddy_id && profile?.is_premium !== true;

  return (
    <div className="min-h-screen bg-stone-50">
      {/* serverPushDead: the send path flagged this student's subscription as
          gone (410/404) — or we've never held one despite the client possibly
          having permission. Either way the healer must mint a FRESH sub, not
          re-upload whatever stale one the browser still returns. */}
      <PushHealer serverPushDead={!!profile?.push_died_at || !profile?.push_subscription} />
      <InstallPing />
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
      {/* ONE onboarding system (founder): /start is the single funnel — it asks
          the target date once and marks onboarding_completed on success, and the
          post-signup sequence reconciles that date a second time. The old
          in-app OnboardingModal used to auto-fire here whenever
          onboarding_completed was false, re-asking every question (the third
          date ask). It's gone from this gate now; the modal component still
          powers profile editing, just not a second onboarding. */}
      {showPostSignup && postSignupProps ? (
        <PostSignupSequence {...postSignupProps} />
      ) : (!pushEnabled || !profile?.push_subscription) && !showOnboarding ? (
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
      {showBuddyNudge && <DailyBuddyNudge fullName={profile?.full_name ?? undefined} />}
    </div>
  );
}
