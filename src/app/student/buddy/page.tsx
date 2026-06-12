import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { BuddyFeedbackCard } from '@/app/student/home/buddy-feedback-card';
import { SessionRequestPanel } from './session-request-panel';
import { Video, Calendar, PhoneCall } from 'lucide-react';
import Link from 'next/link';

export const metadata = {
  title: 'Buddy · CareerRai',
  description: 'Everything between you and your buddy — voice notes, feedback, sessions',
};

export default async function BuddyCommunicationPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('full_name, buddy_id')
    .eq('id', user.id)
    .single();

  const buddyId = profile?.buddy_id ?? null;

  const [{ data: buddy }, { data: sessions }, { data: pendingRequests }] = await Promise.all([
    buddyId
      ? admin.from('profiles').select('full_name, college, cat_percentile').eq('id', buddyId).single()
      : Promise.resolve({ data: null }),
    admin
      .from('video_sessions')
      .select('id, title, scheduled_at, google_meet_link, session_status')
      .eq('student_id', user.id)
      .eq('session_status', 'scheduled')
      .gte('scheduled_at', new Date(Date.now() - 3_600_000).toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(5),
    buddyId
      ? admin
          .from('session_requests')
          .select('id, message, created_at, status')
          .eq('student_id', user.id)
          .eq('buddy_id', buddyId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1)
      : Promise.resolve({ data: [] }),
  ]);

  const buddyName = buddy?.full_name?.split(' ')[0] ?? 'your buddy';
  const hasPendingRequest = (pendingRequests?.length ?? 0) > 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white p-4 sm:p-6">
      <div className="max-w-md mx-auto space-y-6 pb-24">
        {/* Header */}
        <div>
          <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold">Your mentor</p>
          <h1 className="text-2xl font-bold text-stone-900 mt-1" style={{ fontFamily: 'Georgia, serif' }}>
            {buddy ? buddy.full_name : 'Buddy'}
          </h1>
          {buddy && (
            <p className="text-sm text-stone-500 mt-0.5">
              {buddy.college ? `IIM ${buddy.college}` : 'IIM Alumni'}
              {buddy.cat_percentile ? ` · ${buddy.cat_percentile}%ile` : ''}
            </p>
          )}
        </div>

        {!buddyId ? (
          <div className="rounded-2xl border border-stone-200 bg-stone-50 p-8 text-center">
            <p className="text-stone-600 font-medium">No buddy assigned yet</p>
            <p className="text-sm text-stone-400 mt-1">
              We&apos;re matching you with a mentor — voice notes and sessions will appear here.
            </p>
          </div>
        ) : (
          <>
            {/* Upcoming sessions */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <Calendar className="w-4 h-4 text-indigo-600" />
                <h2 className="text-sm font-bold uppercase tracking-widest text-stone-700">Sessions</h2>
              </div>
              {sessions && sessions.length > 0 ? (
                sessions.map((s) => {
                  const startsAt = new Date(s.scheduled_at);
                  const minsAway = Math.round((startsAt.getTime() - Date.now()) / 60_000);
                  const joinable = minsAway <= 15 && !!s.google_meet_link;
                  return (
                    <div
                      key={s.id}
                      className="flex items-center justify-between gap-3 bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Video className="w-4 h-4 text-indigo-600 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-indigo-900 truncate">
                            {s.title || `Session with ${buddyName}`}
                          </p>
                          <p className="text-xs text-indigo-600">
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
                          className="shrink-0 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors"
                        >
                          Join →
                        </a>
                      ) : (
                        <span className="shrink-0 text-[11px] font-medium text-indigo-500">
                          {minsAway > 1440
                            ? `in ${Math.round(minsAway / 1440)}d`
                            : minsAway > 60
                            ? `in ${Math.round(minsAway / 60)}h`
                            : `in ${Math.max(0, minsAway)}m`}
                        </span>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                  <p className="text-sm text-stone-500">No upcoming sessions yet.</p>
                </div>
              )}
            </div>

            {/* Urgent session request panel */}
            <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <PhoneCall className="w-4 h-4 text-orange-700" />
                <h2 className="text-sm font-bold uppercase tracking-widest text-orange-800">Need urgent help?</h2>
              </div>
              <SessionRequestPanel
                buddyId={buddyId}
                buddyName={buddyName}
                hasPendingRequest={hasPendingRequest}
              />
            </div>

            {/* Voice notes + feedback + record response */}
            <BuddyFeedbackCard
              studentId={user.id}
              buddyId={buddyId}
              buddyName={buddy?.full_name ?? 'Buddy'}
            />
          </>
        )}
      </div>
    </div>
  );
}
