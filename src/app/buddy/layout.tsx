import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthUser } from '@/lib/auth';
import { BuddyBottomNav } from '@/components/bottom-nav';
import { NotificationBell } from '@/components/notification-bell';
import { Logo } from '@/components/logo';
import { Badge } from '@/components/ui/badge';
import { getChatUnreadCount } from '@/lib/chat-unread';

export default async function BuddyLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  // Role check and unread count are independent — run them together.
  const [{ data: profile }, chatUnread] = await Promise.all([
    admin.from('profiles').select('role').eq('id', user.id).single(),
    getChatUnreadCount(user.id, 'buddy'),
  ]);
  if (profile?.role !== 'buddy') {
    if (profile?.role === 'student') redirect('/student/tracker');
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-2xl mx-auto px-4 py-6 pb-28">
        <div className="flex items-center justify-between mb-6">
          <Logo />
          <div className="flex items-center gap-2">
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
