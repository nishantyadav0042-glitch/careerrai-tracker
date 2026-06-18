import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { BuddyFeedbackCard } from '@/app/student/home/buddy-feedback-card';
import { SessionRequestPanel } from './session-request-panel';
import { Video, Calendar, PhoneCall, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export const metadata = {
  title: 'Buddy · CareerRai',
  description: 'Everything between you and your buddy — voice notes, feedback, sessions',
};

export default async function BuddyCommunicationPage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('full_name, buddy_id')
    .eq('id', user.id)
    .single();

  const buddyId = profile?.buddy_id ?? null;
  // eslint-disable-next-line react-hooks/purity
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [{ data: buddy }, { data: upcoming }, { data: recentCompleted }, { data: pendingRequests }, { data: lastFeedback }, { data: feedbackRows }] = await Promise.all([
    buddyId
      ? admin.from('profiles').select('full_name, college, cat_percentile').eq('id', buddyId).single()
      : Promise.resolve({ data: null }),
    // Upcoming: scheduled sessions + 1h grace window
    admin
      .from('video_sessions')
      .select('id, title, scheduled_at, google_meet_link, session_status, session_type')
      .eq('student_id', user.id)
      .eq('session_status', 'scheduled')
      // eslint-disable-next-line react-hooks/purity
      .gte('scheduled_at', new Date(Date.now() - 3_600_000).toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(5),
    // Completed within last 7 days — dashboard cleanup: older sessions go to History
    // VIEW FILTER ONLY — no data is ever deleted, all sessions persist forever
    admin
      .from('video_sessions')
      .select('id, title, scheduled_at, session_type, session_status')
      .eq('student_id', user.id)
      .eq('session_status', 'completed')
      .gte('scheduled_at', sevenDaysAgo)
      .order('scheduled_at', { ascending: false })
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
    // Last buddy feedback received — for SLA adherence indicator
    buddyId
      ? admin
          .from('buddy_feedback')
          .select('created_at')
          .eq('student_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    // Pre-fetch buddy feedback to avoid a second client-side loading phase
    buddyId
      ? admin
          .from('buddy_feedback')
          .select(`
            id,
            feedback_text,
            voice_note_url,
            created_at,
            buddy_id,
            read_at,
            thanked_at,
            profiles!buddy_feedback_buddy_id_fkey(full_name, college)
          `)
          .eq('student_id', user.id)
          .eq('buddy_id', buddyId)
          .in('feedback_type', ['buddy_note', 'text'])
          .neq('buddy_id', user.id)
          .order('created_at', { ascending: false })
          .limit(3)
      : Promise.resolve({ data: [] }),
  ]);

  const buddyName = buddy?.full_name?.split(' ')[0] ?? 'your buddy';
  const hasPendingRequest = (pendingRequests?.length ?? 0) > 0;
  const sessions = [...(upcoming ?? []), ...(recentCompleted ?? [])];

  // Pre-sign voice note URLs so VoiceNotePlayer renders immediately with no client-side round-trips.
  const voiceRows = (feedbackRows ?? []).filter((r) => r.voice_note_url);
  let signedUrlMap: Record<string, string> = {};
  if (voiceRows.length > 0) {
    const toPath = (urlOrPath: string) => {
      const marker = '/object/public/voice-notes/';
      const idx = urlOrPath.indexOf(marker);
      return idx >= 0 ? urlOrPath.slice(idx + marker.length) : urlOrPath;
    };
    const paths = voiceRows.map((r) => toPath(r.voice_note_url!));
    const { data: signed } = await admin.storage.from('voice-notes').createSignedUrls(paths, 3600);
    if (signed) {
      signed.forEach((s, i) => { if (s.signedUrl) signedUrlMap[voiceRows[i].id] = s.signedUrl; });
    }
  }

  // SLA: was there a buddy feedback in the last 48h?
  const lastFeedbackMs = lastFeedback?.created_at ? new Date(lastFeedback.created_at).getTime() : null;
  const hoursSinceLastFeedback = lastFeedbackMs ? Math.floor((Date.now() - lastFeedbackMs) / 3_600_000) : null;
  const slaBreached = hoursSinceLastFeedback !== null && hoursSinceLastFeedback > 48;

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

        {/* Buddy SLA promise */}
        {buddyId && (
          <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${slaBreached ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
            {slaBreached ? (
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            )}
            <div className="min-w-0">
              <p className={`text-xs font-semibold ${slaBreached ? 'text-amber-800' : 'text-emerald-800'}`}>
                {slaBreached
                  ? `${buddyName} hasn't sent feedback in ${hoursSinceLastFeedback}h`
                  : `${buddyName} responds within 24h`}
              </p>
              <p className={`text-[11px] mt-0.5 ${slaBreached ? 'text-amber-600' : 'text-emerald-600'}`}>
                {slaBreached
                  ? 'Send a session request if you need help urgently.'
                  : hoursSinceLastFeedback !== null
                  ? `Last feedback ${hoursSinceLastFeedback}h ago`
                  : 'Your mentor is committed to keeping you on track'}
              </p>
            </div>
          </div>
        )}

        {!buddyId ? (
          <div className="rounded-2xl border border-stone-200 bg-stone-50 p-8 text-center">
            <p className="text-stone-600 font-medium">No buddy assigned yet</p>
            <p className="text-sm text-stone-400 mt-1">
              We&apos;re matching you with a mentor — voice notes and sessions will appear here.
            </p>
          </div>
        ) : (
          <>
            {/* Sessions — upcoming + recently completed (7-day window) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-600" />
                  <h2 className="text-sm font-bold uppercase tracking-widest text-stone-700">Sessions</h2>
                </div>
                {/* History link — older completed sessions, never deleted */}
                <Link
                  href="/student/buddy/history"
                  className="flex items-center gap-1 text-[11px] text-stone-400 hover:text-stone-600 transition-colors"
                >
                  <Clock className="w-3 h-3" />
                  History
                </Link>
              </div>

              {sessions.length > 0 ? (
                sessions.map((s) => {
                  const startsAt = new Date(s.scheduled_at);
                  // eslint-disable-next-line react-hooks/purity
                  const minsAway = Math.round((startsAt.getTime() - Date.now()) / 60_000);
                  const isCompleted = s.session_status === 'completed';
                  const isOrientation = s.session_type === 'onboarding';
                  const joinable = !isCompleted && minsAway <= 15 && !!('google_meet_link' in s && s.google_meet_link);
                  return (
                    <div
                      key={s.id}
                      className={`flex items-center justify-between gap-3 border rounded-2xl px-4 py-3 ${
                        isOrientation
                          ? 'bg-orange-50 border-orange-200'
                          : isCompleted
                          ? 'bg-stone-50 border-stone-200'
                          : 'bg-indigo-50 border-indigo-200'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Video className={`w-4 h-4 shrink-0 ${isOrientation ? 'text-orange-600' : isCompleted ? 'text-stone-400' : 'text-indigo-600'}`} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className={`text-sm font-semibold truncate ${isOrientation ? 'text-orange-900' : isCompleted ? 'text-stone-500' : 'text-indigo-900'}`}>
                              {s.title || (isOrientation ? 'Free Orientation' : `Session with ${buddyName}`)}
                            </p>
                            {isOrientation && (
                              <span className="shrink-0 text-[9px] font-bold bg-orange-200 text-orange-800 px-1.5 py-0.5 rounded-full">
                                FREE
                              </span>
                            )}
                          </div>
                          <p className={`text-xs ${isOrientation ? 'text-orange-600' : isCompleted ? 'text-stone-400' : 'text-indigo-600'}`}>
                            {startsAt.toLocaleString('en-IN', {
                              timeZone: 'Asia/Kolkata',
                              weekday: 'short',
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                            {isCompleted && ' · Done'}
                          </p>
                        </div>
                      </div>
                      {joinable ? (
                        <a
                          href={(s as { google_meet_link?: string }).google_meet_link!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors"
                        >
                          Join →
                        </a>
                      ) : !isCompleted ? (
                        <span className="shrink-0 text-[11px] font-medium text-indigo-500">
                          {minsAway > 1440
                            ? `in ${Math.round(minsAway / 1440)}d`
                            : minsAway > 60
                            ? `in ${Math.round(minsAway / 60)}h`
                            : `in ${Math.max(0, minsAway)}m`}
                        </span>
                      ) : null}
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
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              initialFeedbacks={(feedbackRows ?? []) as any}
              initialSignedUrls={signedUrlMap}
            />
          </>
        )}
      </div>
    </div>
  );
}
