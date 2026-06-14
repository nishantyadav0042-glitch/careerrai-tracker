import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { BuddyBottomNav } from '@/components/bottom-nav';
import { NotificationBell } from '@/components/notification-bell';
import { Logo } from '@/components/logo';
import { Badge } from '@/components/ui/badge';
import { getChatUnreadCount } from '@/lib/chat-unread';

export default async function BuddyLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'buddy') {
    if (profile?.role === 'student') redirect('/student/tracker');
    redirect('/login');
  }

  const chatUnread = await getChatUnreadCount(user.id, 'buddy');

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
