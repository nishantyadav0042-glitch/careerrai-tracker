import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { NotifPrefsPanel } from '@/components/notif-prefs-panel';
import { LogoutButton } from '@/components/logout-button';
import type { NotifPrefs } from '@/types';

export default async function BuddyProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('full_name, email, notif_prefs').eq('id', user.id).single();
  if (!profile) redirect('/login');

  const { count: studentCount } = await admin
    .from('profiles')
    .select('id', { count: 'exact' })
    .eq('buddy_id', user.id);

  const initials = profile.full_name[0].toUpperCase();
  const defaultPrefs: NotifPrefs = { daily_reminder: true, reminder_time: '20:00', email: true, push: false };
  const prefs: NotifPrefs = { ...defaultPrefs, ...(profile.notif_prefs ?? {}) };

  return (
    <div className="space-y-5 pb-24">
      <div className="px-1">
        <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold">Profile</p>
        <h1 className="text-2xl font-bold text-stone-900 mt-1" style={{ fontFamily: 'Georgia, serif' }}>You</h1>
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-gradient-to-br from-orange-600 to-orange-700 rounded-full flex items-center justify-center text-white text-xl font-bold">
            {initials}
          </div>
          <div>
            <div className="text-lg font-bold text-stone-900">{profile.full_name}</div>
            <div className="text-sm text-stone-600">{profile.email}</div>
            <div className="mt-1"><Badge color="orange">Buddy</Badge></div>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-2">Active students</div>
        <div className="text-2xl font-bold text-stone-900 font-mono">{studentCount ?? 0}</div>
      </Card>

      <NotifPrefsPanel initial={prefs} label1="Daily student digest" label2="Email notifications" />

      <LogoutButton />
    </div>
  );
}
