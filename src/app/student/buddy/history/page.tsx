import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ArrowLeft, Video } from 'lucide-react';
import Link from 'next/link';

export const metadata = { title: 'Session History · CareerRai' };

export default async function SessionHistoryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  // All completed sessions — full history, never deleted, view-only
  const { data: sessions } = await admin
    .from('video_sessions')
    .select('id, title, scheduled_at, session_type, session_status, duration_minutes')
    .eq('student_id', user.id)
    .in('session_status', ['completed', 'cancelled'])
    .order('scheduled_at', { ascending: false })
    .limit(100);

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white p-4 sm:p-6">
      <div className="max-w-md mx-auto space-y-4 pb-24">
        <div className="flex items-center gap-3">
          <Link href="/student/buddy" className="p-2 -ml-2 rounded-xl hover:bg-stone-100 transition-colors">
            <ArrowLeft className="w-5 h-5 text-stone-600" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
              Session History
            </h1>
            <p className="text-xs text-stone-500">All past sessions — data preserved forever</p>
          </div>
        </div>

        {!sessions || sessions.length === 0 ? (
          <div className="rounded-2xl border border-stone-200 bg-stone-50 p-8 text-center">
            <p className="text-stone-500 text-sm">No completed sessions yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => {
              const isOrientation = s.session_type === 'onboarding';
              const isCancelled = s.session_status === 'cancelled';
              return (
                <div
                  key={s.id}
                  className={`flex items-center gap-3 border rounded-2xl px-4 py-3 ${
                    isCancelled ? 'border-stone-100 bg-stone-50' : 'border-stone-200 bg-white'
                  }`}
                >
                  <Video className={`w-4 h-4 shrink-0 ${isCancelled ? 'text-stone-300' : 'text-stone-500'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className={`text-sm font-medium truncate ${isCancelled ? 'text-stone-400 line-through' : 'text-stone-800'}`}>
                        {s.title || (isOrientation ? 'Free Orientation' : 'Guidance Session')}
                      </p>
                      {isOrientation && (
                        <span className="shrink-0 text-[9px] font-bold bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">
                          FREE
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-stone-400">
                      {new Date(s.scheduled_at).toLocaleString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {s.duration_minutes ? ` · ${s.duration_minutes}m` : ''}
                      {isCancelled ? ' · Cancelled' : ' · Completed'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
