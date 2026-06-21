import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthUser } from '@/lib/auth';
import { StudentBottomNav } from '@/components/bottom-nav';
import { NotificationBell } from '@/components/notification-bell';
import { Logo } from '@/components/logo';
import { Badge } from '@/components/ui/badge';
import { getChatUnreadCount, getNotifUnreadCount } from '@/lib/chat-unread';
import { OnboardingGate } from './onboarding/onboarding-gate';

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

  // Fast path: role cookie set at login avoids a DB round-trip on every page.
  const cookieStore = await cookies();
  const roleCookie = cookieStore.get('user_role')?.value;

  const admin = createAdminClient();

  if (roleCookie === 'student') {
    // Role cookie present — still fetch role from DB in the same query to catch
    // stale cookies (e.g. role changed in DB after last login).
    const [chatUnread, notifUnread, { data: profile }] = await Promise.all([
      getChatUnreadCount(user.id, 'student'),
      getNotifUnreadCount(user.id),
      admin.from('profiles').select('role, is_demo, onboarding_completed').eq('id', user.id).single(),
    ]);

    if (profile?.role === 'admin') redirect('/admin');
    if (profile?.role === 'buddy') redirect('/buddy/home');

    // New students must complete profile onboarding (name, college, course,
    // dream colleges, baseline). Demo accounts are read-only and skip it.
    const showOnboarding = !profile?.is_demo && profile?.onboarding_completed !== true;

    return (
      <div className="min-h-screen bg-stone-50">
        <div className="max-w-2xl mx-auto px-4 py-6 pb-28">
          <div className="flex items-center justify-between mb-6">
            <Logo />
            <div className="flex items-center gap-2">
              {profile?.is_demo && <Badge color="purple">Demo</Badge>}
              <Badge color="stone">Student</Badge>
              <NotificationBell userId={user.id} initialUnreadCount={notifUnread} />
            </div>
          </div>
          {profile?.is_demo && <DemoBanner />}
          {children}
        </div>
        <StudentBottomNav chatUnread={chatUnread} />
        {showOnboarding && <OnboardingGate />}
      </div>
    );
  }

  // Slow path (first load or cookie missing): verify role from DB, set cookie.
  const [{ data: profile }, chatUnread, notifUnread] = await Promise.all([
    admin.from('profiles').select('role, is_demo, onboarding_completed').eq('id', user.id).single(),
    getChatUnreadCount(user.id, 'student'),
    getNotifUnreadCount(user.id),
  ]);
  if (profile?.role !== 'student') {
    if (profile?.role === 'buddy') redirect('/buddy/home');
    if (profile?.role === 'admin') redirect('/admin');
    redirect('/login');
  }

  const showOnboarding = !profile?.is_demo && profile?.onboarding_completed !== true;

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-2xl mx-auto px-4 py-6 pb-28">
        <div className="flex items-center justify-between mb-6">
          <Logo />
          <div className="flex items-center gap-2">
            {profile?.is_demo && <Badge color="purple">Demo</Badge>}
            <Badge color="stone">Student</Badge>
            <NotificationBell userId={user.id} initialUnreadCount={notifUnread} />
          </div>
        </div>
        {profile?.is_demo && <DemoBanner />}
        {children}
      </div>
      <StudentBottomNav chatUnread={chatUnread} />
      {showOnboarding && <OnboardingGate />}
    </div>
  );
}
