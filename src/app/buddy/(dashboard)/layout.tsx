import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthUser } from '@/lib/auth';
import { BuddyBottomNav } from '@/components/bottom-nav';
import { NotificationBell } from '@/components/notification-bell';
import { Logo } from '@/components/logo';
import { Badge } from '@/components/ui/badge';
import { getChatUnreadCount } from '@/lib/chat-unread';

export default async function BuddyDashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const [{ data: profile }, chatUnread] = await Promise.all([
    admin.from('profiles').select('role, is_demo, buddy_onboarding_completed').eq('id', user.id).single(),
    getChatUnreadCount(user.id, 'buddy'),
  ]);

  if (profile?.role !== 'buddy') {
    if (profile?.role === 'student') redirect('/student/tracker');
    redirect('/login');
  }

  // Gate: buddy must complete storefront setup before accessing the dashboard.
  if (!profile?.buddy_onboarding_completed) {
    redirect('/buddy/setup');
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-2xl mx-auto px-4 py-6 pb-28">
        <div className="flex items-center justify-between mb-6">
          <Logo />
          <div className="flex items-center gap-2">
            {profile?.is_demo && <Badge color="purple">Demo</Badge>}
            <Badge color="orange">Buddy</Badge>
            <NotificationBell userId={user.id} />
          </div>
        </div>
        {children}
      </div>
      <BuddyBottomNav chatUnread={chatUnread} />
    </div>
  );
}
