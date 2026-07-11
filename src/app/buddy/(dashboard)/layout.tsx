import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthUser } from '@/lib/auth';
import { BuddyBottomNav } from '@/components/bottom-nav';
import { NotificationBell } from '@/components/notification-bell';
import { Logo } from '@/components/logo';
import { Badge } from '@/components/ui/badge';
import { getChatUnreadCount, getNotifUnreadCount } from '@/lib/chat-unread';
import { PushGate } from '@/components/push-gate';
import { BuddyFirstLoginGuide } from '@/components/buddy-first-login-guide';
import { InstallPing } from '@/components/install-ping';

export default async function BuddyDashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const cookieStore = await cookies();
  const roleCookie = cookieStore.get('user_role')?.value;

  const admin = createAdminClient();

  // Outer buddy/layout.tsx already verified role === 'buddy' (or cookie did).
  // Here we only need is_demo + onboarding_completed — no need to re-check role.
  const [{ data: profile }, chatUnread, notifUnread] = await Promise.all([
    admin.from('profiles').select('role, is_demo, buddy_onboarding_completed, buddy_tour_completed, notif_prefs').eq('id', user.id).single(),
    getChatUnreadCount(user.id, 'buddy'),
    getNotifUnreadCount(user.id),
  ]);

  // Validate role when cookie is absent (first load or expired).
  if (!roleCookie && profile?.role !== 'buddy') {
    if (profile?.role === 'student') redirect('/student/tracker');
    redirect('/login');
  }

  // Gate: buddy must complete storefront setup before accessing the dashboard.
  if (!profile?.buddy_onboarding_completed) {
    redirect('/buddy/setup');
  }

  // One-time "what a buddy does" playbook right after setup, then the
  // mandatory push step (so they're alerted to student messages and risk
  // flags in real time). Same precedence as the student layout: guide first.
  const showBuddyGuide = !profile?.is_demo && profile?.buddy_tour_completed !== true;
  const buddyPushEnabled = (profile?.notif_prefs as { push?: boolean } | null)?.push === true;
  const showBuddyPushGate = !profile?.is_demo && !buddyPushEnabled;

  return (
    <div className="min-h-screen bg-stone-50">
      <InstallPing />
      <div className="max-w-2xl mx-auto px-4 py-6 pb-28">
        <div className="flex items-center justify-between mb-6">
          <Logo />
          <div className="flex items-center gap-2">
            {profile?.is_demo && <Badge color="purple">Demo</Badge>}
            <Badge color="orange">Buddy</Badge>
            <NotificationBell userId={user.id} initialUnreadCount={notifUnread} />
          </div>
        </div>
        {children}
      </div>
      <BuddyBottomNav chatUnread={chatUnread} />
      {showBuddyGuide ? <BuddyFirstLoginGuide /> : showBuddyPushGate && <PushGate mode="staff" />}
    </div>
  );
}
