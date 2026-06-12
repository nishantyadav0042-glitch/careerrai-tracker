import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { DailyTrackerApp } from '@/components/DailyTracker/DailyTrackerApp';

export const metadata = {
  title: 'CareerRai',
  description: 'Your CAT prep command centre',
};

const CAT_EXAM_DATE = new Date(2026, 10, 29); // Nov 29, 2026

export default async function DailyTrackerPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const [{ data: profile }, { data: sessions }] = await Promise.all([
    admin.from('profiles').select('full_name, cat_percentile').eq('id', user.id).single(),
    admin
      .from('video_sessions')
      .select('id, title, scheduled_at, google_meet_link')
      .eq('student_id', user.id)
      .eq('session_status', 'scheduled')
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(1),
  ]);

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there';
  const daysToCat = Math.max(
    0,
    Math.ceil((CAT_EXAM_DATE.getTime() - Date.now()) / 86_400_000)
  );

  const hour = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false });
  const h = parseInt(hour);
  const greeting = h < 4 ? 'Burning the midnight oil' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';

  // Only surface a session happening within the next 24h
  const nextSession = sessions?.[0] ?? null;
  const todaySession =
    nextSession && new Date(nextSession.scheduled_at).getTime() - Date.now() < 24 * 3_600_000
      ? nextSession
      : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white p-4 sm:p-6">
      <div className="max-w-md mx-auto space-y-5">
        {/* Header: greeting + CRS pill + days-to-CAT chip */}
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-stone-900 truncate" style={{ fontFamily: 'Georgia, serif' }}>
            {greeting}, {firstName}
          </h1>
          <div className="flex items-center gap-1.5 shrink-0">
            {profile?.cat_percentile != null && (
              <span className="text-[11px] font-bold bg-stone-900 text-white rounded-full px-2.5 py-1">
                CRS {profile.cat_percentile}
              </span>
            )}
            <span className="text-[11px] font-semibold bg-orange-100 text-orange-700 rounded-full px-2.5 py-1">
              {daysToCat}d to CAT
            </span>
          </div>
        </div>

        <DailyTrackerApp studentId={user.id} todaySession={todaySession} />
      </div>
    </div>
  );
}
