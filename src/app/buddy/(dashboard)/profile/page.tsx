import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { Settings, Video } from 'lucide-react';
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

  const [{ count: studentCount }, { data: upcomingSessions }] = await Promise.all([
    admin
      .from('profiles')
      .select('id', { count: 'exact' })
      .eq('buddy_id', user.id),
    admin
      .from('video_sessions')
      .select('id, title, scheduled_at, google_meet_link, student_id, profiles!video_sessions_student_id_fkey(full_name)')
      .eq('buddy_id', user.id)
      .eq('session_status', 'scheduled')
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(5),
  ]);

  const displayName = profile.full_name ?? 'Buddy';
  const initials = displayName[0].toUpperCase();
  const defaultPrefs: NotifPrefs = { daily_reminder: true, reminder_time: '20:00', email: true, push: false };
  const prefs: NotifPrefs = { ...defaultPrefs, ...(profile.notif_prefs ?? {}) };

  return (
    <div className="space-y-5 pb-24">
      <div className="px-1 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold">Profile</p>
          <h1 className="text-2xl font-bold text-stone-900 mt-1" style={{ fontFamily: 'Georgia, serif' }}>You</h1>
        </div>
        <Link
          href="/buddy/settings"
          className="p-2 text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors"
          title="Settings"
        >
          <Settings className="w-5 h-5" />
        </Link>
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-gradient-to-br from-teal-600 to-teal-700 rounded-full flex items-center justify-center text-white text-xl font-bold">
            {initials}
          </div>
          <div>
            <div className="text-lg font-bold text-stone-900">{displayName}</div>
            {profile.email && <div className="text-sm text-stone-600">{profile.email}</div>}
            <div className="mt-1"><Badge color="orange">Buddy</Badge></div>
            <Link
              href="/buddy/setup"
              className="flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-stone-900 transition-colors mt-1"
            >
              Edit setup
            </Link>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-1">Students</div>
          <div className="text-2xl font-bold text-stone-900 font-mono">{studentCount ?? 0}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-1">Sessions booked</div>
          <div className="text-2xl font-bold text-stone-900 font-mono">{upcomingSessions?.length ?? 0}</div>
        </Card>
      </div>

      {/* Upcoming sessions */}
      {(upcomingSessions?.length ?? 0) > 0 && (
        <div>
          <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-3 px-1">Upcoming sessions</p>
          <div className="space-y-2">
            {upcomingSessions!.map((s) => {
              const startsAt = new Date(s.scheduled_at);
              // eslint-disable-next-line react-hooks/purity
              const minsAway = Math.round((startsAt.getTime() - Date.now()) / 60_000);
              const joinable = minsAway <= 15 && !!s.google_meet_link;
              const studentName = (s.profiles as { full_name?: string } | null)?.full_name ?? 'Student';
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 bg-white border border-stone-200 rounded-xl px-4 py-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Video className="w-4 h-4 text-teal-600 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-stone-900 truncate">
                        {s.title || `Session with ${studentName.split(' ')[0]}`}
                      </p>
                      <p className="text-xs text-stone-500">
                        {startsAt.toLocaleString('en-IN', {
                          timeZone: 'Asia/Kolkata',
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                  {joinable ? (
                    <a
                      href={s.google_meet_link!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg transition-colors"
                    >
                      Join →
                    </a>
                  ) : (
                    <span className="shrink-0 text-xs text-stone-500 font-medium bg-stone-100 px-2 py-1 rounded-lg">
                      {minsAway > 1440
                        ? `in ${Math.round(minsAway / 1440)}d`
                        : minsAway > 60
                        ? `in ${Math.round(minsAway / 60)}h`
                        : `in ${Math.max(0, minsAway)}m`}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(upcomingSessions?.length ?? 0) === 0 && (
        <Card className="p-4 bg-stone-50 text-center">
          <p className="text-sm text-stone-500">No sessions scheduled yet.</p>
          <Link href="/buddy/schedule" className="text-xs text-teal-700 font-medium hover:underline mt-1 inline-block">
            Schedule a session →
          </Link>
        </Card>
      )}

      <NotifPrefsPanel initial={prefs} label1="Daily student digest" label2="Email notifications" />

      <LogoutButton />
    </div>
  );
}
