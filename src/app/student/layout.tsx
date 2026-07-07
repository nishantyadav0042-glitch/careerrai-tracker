import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthUser } from '@/lib/auth';
import { StudentBottomNav } from '@/components/bottom-nav';
import { NotificationBell } from '@/components/notification-bell';
import { Logo } from '@/components/logo';
import { Badge } from '@/components/ui/badge';
import { getChatUnreadCount, getNotifUnreadCount } from '@/lib/chat-unread';
import { OnboardingGate } from './onboarding/onboarding-gate';
import { DemoWelcomeModal } from '@/components/demo-welcome-modal';
import { PushGate } from '@/components/push-gate';

function DemoBanner() {
  return (
    <div className="mb-4 flex items-center gap-2 rounded-xl border border-purple-200 bg-purple-50 px-3 py-2 text-xs text-purple-800">
      <span className="text-sm leading-none">👀</span>
      <span><span className="font-semibold">Demo — view only.</span> This is a real student&apos;s data; changes aren&apos;t saved.</span>
    </div>
  );
}

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const [chatUnread, notifUnread, { data: profile }] = await Promise.all([
    getChatUnreadCount(user.id, 'student'),
    getNotifUnreadCount(user.id),
    admin.from('profiles').select('role, is_demo, is_premium, onboarding_completed, notif_prefs').eq('id', user.id).single(),
  ]);

  // Route non-students to their own home (handles stale role cookies too).
  // Only redirect when the profile actually loaded — a transient null read must
  // degrade to rendering (the old fast path did), never bounce to /login, which
  // the proxy would send straight back here → an infinite redirect loop.
  if (profile?.role === 'admin') redirect('/admin');
  if (profile?.role === 'buddy') redirect('/buddy/home');
  if (profile && profile.role !== 'student') redirect('/login');

  const isDemo = !!profile?.is_demo;
  // Login → Blueprint Builder, nothing in between. Its own intro screen is
  // the one hero the founder wants; the old FirstLoginTour was a second,
  // redundant hero in front of it and is gone. The Builder stays until
  // completed — no skip, no dismiss.
  const showOnboarding = !isDemo && profile?.onboarding_completed !== true;
  // Mandatory push step — only AFTER the Blueprint exists. Shown to every
  // non-demo student who hasn't turned push on yet (notif_prefs.push !==
  // true). Enabling sets that flag, so the gate appears at most once per
  // student and then never again.
  const pushEnabled = (profile?.notif_prefs as { push?: boolean } | null)?.push === true;
  const showPushGate = !isDemo && !showOnboarding && !pushEnabled;

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-2xl mx-auto px-4 py-6 pb-28">
        <div className="flex items-center justify-between mb-6">
          <Logo />
          <div className="flex items-center gap-2">
            {isDemo && <Badge color="purple">Demo</Badge>}
            <Badge color="stone">Student</Badge>
            <NotificationBell userId={user.id} initialUnreadCount={notifUnread} />
          </div>
        </div>
        {isDemo && <DemoBanner />}
        {isDemo && <DemoWelcomeModal />}
        {children}
      </div>
      <StudentBottomNav chatUnread={chatUnread} />
      {showOnboarding ? <OnboardingGate /> : showPushGate && <PushGate />}
    </div>
  );
}
