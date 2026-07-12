import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthUser } from '@/lib/auth';
import { StudentBottomNav } from '@/components/bottom-nav';
import { NotificationBell } from '@/components/notification-bell';
import { Logo } from '@/components/logo';
import { Badge } from '@/components/ui/badge';
import { getChatUnreadCount, getNotifUnreadCount } from '@/lib/chat-unread';
import { OnboardingGate } from './onboarding/onboarding-gate';
import { PushGate } from '@/components/push-gate';
import PostSignupSequence from '@/components/post-signup-sequence';
import { InstallPing } from '@/components/install-ping';
import { StandaloneNotifAsk } from '@/components/standalone-notif-ask';
import { computeTopicMemory } from '@/lib/prep-memory-data';
import { remainingPrepHours, EXAM_UNIT_COUNT } from '@/lib/blueprint-builder';
import { getStudentProfile } from '@/lib/student-profile';

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
  const pushPrompted = notifPrefs.push_prompted === true;
  const pushReprompted = notifPrefs.push_reprompted === true;
  // New students meet the permission INSIDE the Builder now (screen 3,
  // "you own the plan, we own the reminders" — asked right after they pick
  // their date, so it has a reason attached). This pre-Builder gate only
  // remains for already-onboarded accounts that were never prompted.
  // Post-login sequence (once, right after onboarding completes): install →
  // reconcile the date → commit → thank you → the two-way deal. Supersedes the
  // pre-Builder push gates for new students (they already met the permission
  // inside the funnel). Only the hoursLeft compute below runs, and only when
  // the sequence is actually about to render.
  const showPostSignup = !showOnboarding && profile?.post_signup_done !== true;

  let postSignupProps: { targetIso: string | null; hoursLeft: number } | null = null;
  if (showPostSignup) {
    const archetype = { isRepeater: !!profile?.is_repeater, isWorkingProfessional: !!profile?.is_working_professional };
    const topicMemory = await computeTopicMemory(admin, user.id, archetype);
    const practicing = topicMemory.filter((t) => t.status === 'practicing' || t.status === 'revising' || t.status === 'exam_ready').length;
    const learning = topicMemory.filter((t) => t.status === 'learning').length;
    const hoursLeft = remainingPrepHours({ coverage_total: topicMemory.length || EXAM_UNIT_COUNT, coverage_practicing: practicing, coverage_learning: learning });
    postSignupProps = {
      targetIso: (profile?.syllabus_target_date as string | null) ?? null,
      hoursLeft,
    };
  }

  const showFirstPushAsk = !showOnboarding && !showPostSignup && !pushEnabled && !pushPrompted;
  const showSecondPushAsk = !showOnboarding && !showPostSignup && !pushEnabled && pushPrompted && !pushReprompted;

  return (
    <div className="min-h-screen bg-stone-50">
      <InstallPing />
      <div className="max-w-2xl mx-auto px-4 py-6 pb-28">
        <div className="flex items-center justify-between mb-6">
          <Logo />
          <div className="flex items-center gap-2">
            <Badge color="stone">Student</Badge>
            <NotificationBell userId={user.id} initialUnreadCount={notifUnread} />
          </div>
        </div>
        {children}
      </div>
      <StudentBottomNav chatUnread={chatUnread} />
      {showOnboarding ? (
        <OnboardingGate />
      ) : showPostSignup && postSignupProps ? (
        <PostSignupSequence {...postSignupProps} />
      ) : !pushEnabled ? (
        // Founder flow: in the INSTALLED app, the notification ask is "our
        // job #1 — switch on notifications" (renders only in standalone mode;
        // returns null in a browser tab, where the PushGates below apply).
        <>
          <StandaloneNotifAsk pushEnabled={pushEnabled} />
          {showFirstPushAsk ? (
            <PushGate mode="first" notifPrefs={notifPrefs} />
          ) : (
            showSecondPushAsk && <PushGate mode="second" notifPrefs={notifPrefs} />
          )}
        </>
      ) : null}
    </div>
  );
}
