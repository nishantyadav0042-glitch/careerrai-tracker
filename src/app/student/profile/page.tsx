import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { NotifPrefsPanel } from '@/components/notif-prefs-panel';
import { LogoutButton } from '@/components/logout-button';
import { PushToggle } from '@/components/push-toggle';
import { ShareProgressButton } from '@/components/share-progress-button';
import { Check, GraduationCap, Clock } from 'lucide-react';
import type { NotifPrefs } from '@/types';
import { DreamCollegesCard } from '@/components/dream-colleges-card';

export default async function StudentProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('full_name, email, exam_target, buddy_id, notif_prefs, created_at, dream_colleges').eq('id', user.id).single();
  if (!profile) redirect('/login');

  // Buddy credentials + trust signals
  let buddy: { full_name: string; college: string | null; cat_percentile: number | null; buddy_bio: string | null } | null = null;
  let responseHours: number | null = null;
  if (profile.buddy_id) {
    const { data: b } = await admin
      .from('profiles')
      .select('full_name, college, cat_percentile, buddy_bio')
      .eq('id', profile.buddy_id)
      .single();
    buddy = b;

    // Response rate: avg gap between feedback creation and the day it covers (last 30 days)
    const { data: recentFeedback } = await admin
      .from('buddy_feedback')
      .select('created_at, feedback_date')
      .eq('buddy_id', profile.buddy_id)
      // eslint-disable-next-line react-hooks/purity
      .gte('created_at', new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString())
      .limit(20);
    if (recentFeedback && recentFeedback.length > 0) {
      const gaps = recentFeedback
        .map((f) => (new Date(f.created_at).getTime() - new Date(f.feedback_date + 'T00:00:00').getTime()) / 3600000)
        .filter((h) => h >= 0 && h < 24 * 7);
      if (gaps.length > 0) {
        responseHours = Math.max(1, Math.round(gaps.reduce((s, h) => s + h, 0) / gaps.length));
      }
    }
  }

  // Progress summary
  const [{ count: daysLogged }, { data: streak }, { data: latestTest }] = await Promise.all([
    admin.from('daily_reports').select('id', { count: 'exact', head: true }).eq('student_id', user.id),
    admin.from('streak_data').select('current_streak, longest_streak').eq('student_id', user.id).maybeSingle(),
    admin.from('test_results').select('percentile').eq('student_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const bestStreak = streak?.longest_streak ?? 0;
  const latestPercentile: number | null = latestTest?.percentile ?? null;
  const targetPercentile = 90;
  const progressPct = latestPercentile ? Math.min(100, Math.round((latestPercentile / targetPercentile) * 100)) : 0;

  const initials = profile.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  const buddyInitials = buddy ? buddy.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() : '';
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

      {/* Progress Summary */}
      <Card className="p-5">
        <div className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-4">Your Progress</div>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{daysLogged ?? 0}</div>
            <div className="text-xs text-stone-500 mt-0.5">Days logged</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{bestStreak}</div>
            <div className="text-xs text-stone-500 mt-0.5">Best streak</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{latestPercentile ? `${Math.round(latestPercentile)}%` : '—'}</div>
            <div className="text-xs text-stone-500 mt-0.5">Latest %ile</div>
          </div>
        </div>
        {latestPercentile !== null && (
          <div className="mb-4">
            <div className="w-full bg-stone-200 rounded-full h-2">
              <div className="h-2 rounded-full bg-gradient-to-r from-orange-500 to-orange-600" style={{ width: `${progressPct}%` }} />
            </div>
            <p className="text-xs text-stone-500 mt-1.5">You&apos;re {progressPct}% of the way to your {targetPercentile}%ile target</p>
          </div>
        )}
        <ShareProgressButton daysLogged={daysLogged ?? 0} bestStreak={bestStreak} percentile={latestPercentile} />
      </Card>

      <DreamCollegesCard initial={(profile.dream_colleges as string[] | null) ?? []} />

      {/* Buddy Trust Signals */}
      <Card className="p-5">
        <div className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-3">Your Buddy</div>
        {buddy ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 bg-gradient-to-br from-teal-600 to-teal-800 rounded-full flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
                {buddyInitials}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-stone-900">{buddy.full_name}</div>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  {buddy.college && (
                    <Badge color="blue"><GraduationCap className="w-3 h-3 inline mr-1" />{buddy.college}</Badge>
                  )}
                  {buddy.cat_percentile && (
                    <Badge color="orange">{Number(buddy.cat_percentile).toFixed(0)}%ile CAT</Badge>
                  )}
                </div>
              </div>
            </div>
            {buddy.buddy_bio && (
              <p className="text-sm text-stone-700 italic leading-relaxed border-l-2 border-teal-300 pl-3">
                &quot;{buddy.buddy_bio}&quot;
              </p>
            )}
            {responseHours !== null && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
                <Clock className="w-3.5 h-3.5" />
                Responds within {responseHours} hr{responseHours === 1 ? '' : 's'} — verified
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-stone-900">Not yet assigned</span>
          </div>
        )}
        {profile.buddy_id && (
          <div className="mt-3 pt-3 border-t border-stone-100">
            <Badge color="green"><Check className="w-3 h-3 inline mr-1" />Connected</Badge>
          </div>
        )}
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
