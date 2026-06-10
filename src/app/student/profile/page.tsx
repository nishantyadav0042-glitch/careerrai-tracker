import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { NotifPrefsPanel } from '@/components/notif-prefs-panel';
import { LogoutButton } from '@/components/logout-button';
import { PushToggle } from '@/components/push-toggle';
import { Check } from 'lucide-react';
import type { NotifPrefs } from '@/types';

export default async function StudentProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('full_name, email, exam_target, buddy_id, notif_prefs, created_at').eq('id', user.id).single();
  if (!profile) redirect('/login');

  let buddyName: string | null = null;
  if (profile.buddy_id) {
    const { data: buddy } = await admin.from('profiles').select('full_name').eq('id', profile.buddy_id).single();
    buddyName = buddy?.full_name ?? null;
  }

  const initials = profile.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
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
          <div className="w-16 h-16 bg-gradient-to-br from-stone-900 to-stone-700 rounded-full flex items-center justify-center text-white text-xl font-bold">
            {initials}
          </div>
          <div>
            <div className="text-lg font-bold text-stone-900">{profile.full_name}</div>
            <div className="text-sm text-stone-600">{profile.email}</div>
            <div className="mt-1"><Badge color="stone">{profile.exam_target ?? 'Student'}</Badge></div>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-2">Buddy</div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-stone-900">
            {buddyName ?? (profile.buddy_id ? 'Connected' : 'Not yet assigned')}
          </span>
          {profile.buddy_id && (
            <Badge color="green"><Check className="w-3 h-3 inline mr-1" />Connected</Badge>
          )}
        </div>
      </Card>

      <NotifPrefsPanel initial={prefs} label1="Daily reminder" label2="Email notifications" />

      <Card className="p-5">
        <div className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-4">Push notifications</div>
        <PushToggle initialEnabled={prefs.push ?? false} />
        <p className="text-xs text-stone-400 mt-2">Get instant alerts on your device even when the app is closed.</p>
      </Card>

      <Card className="p-5">
        <div className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-2">Member since</div>
        <div className="text-sm font-semibold text-stone-900">
          {new Date(profile.created_at).toLocaleDateString('en-IN', {
            weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
          })}
        </div>
      </Card>

      <LogoutButton />
    </div>
  );
}
