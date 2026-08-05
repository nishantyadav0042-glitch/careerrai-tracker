import { BuddyFeedbackCard } from '@/app/student/home/buddy-feedback-card';
import { SessionRequestPanel } from './session-request-panel';
import { Video, Calendar, PhoneCall, Clock } from 'lucide-react';
import Link from 'next/link';

interface BuddyRow {
  full_name: string;
  college: string | null;
  cat_percentile: number | null;
  buddy_bio: string | null;
  avatar_url: string | null;
}

interface SessionRow {
  id: string;
  title: string | null;
  scheduled_at: string;
  session_status: string;
  session_type: string | null;
  google_meet_link?: string | null;
}

// Purely presentational — was the whole /student/buddy page; now the
// "Buddy" tab's content inside the merged Buddy panel (Buddy + Chat, one
// screen). All data-fetching stays in page.tsx.
export function BuddyOverview({
  studentId,
  buddy,
  buddyId,
  buddyName,
  buddyInitials,
  sessions,
  nextSession,
  hasPendingRequest,
  feedbackRows,
  now,
}: {
  studentId: string;
  buddy: BuddyRow | null;
  buddyId: string | null;
  buddyName: string;
  buddyInitials: string;
  sessions: SessionRow[];
  nextSession: SessionRow | null;
  hasPendingRequest: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  feedbackRows: any;
  now: number;
}) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold">Your buddy</p>
        {buddy ? (
          <div className="mt-2 space-y-3">
            <div className="flex items-center gap-3">
              {buddy.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={buddy.avatar_url}
                  alt={buddy.full_name}
                  className="w-14 h-14 rounded-full object-cover flex-shrink-0 border border-stone-200"
                />
              ) : (
                <div className="w-14 h-14 bg-gradient-to-br from-teal-600 to-teal-800 rounded-full flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
                  {buddyInitials}
                </div>
              )}
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-stone-900 truncate" style={{ fontFamily: 'Georgia, serif' }}>
                  {buddy.full_name}
                </h1>
                <p className="text-sm text-stone-500 mt-0.5">
                  {buddy.college ?? 'IIM Alumni'}
                  {buddy.cat_percentile ? ` · ${Number(buddy.cat_percentile).toFixed(1)}%ile CAT` : ''}
                </p>
              </div>
            </div>
            {buddy.buddy_bio && (
              <p className="text-sm text-stone-700 italic leading-relaxed border-l-2 border-teal-300 pl-3">
                &quot;{buddy.buddy_bio}&quot;
              </p>
            )}
          </div>
        ) : (
          <h1 className="text-2xl font-bold text-stone-900 mt-1" style={{ fontFamily: 'Georgia, serif' }}>
            Buddy
          </h1>
        )}
      </div>

      {/* Weekly video sessions — the core value: learning to analyse your own mocks */}
      {buddyId && (
        <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white px-4 py-3.5 space-y-1.5">
          <div className="flex items-center gap-2">
            <Video className="w-4 h-4 text-indigo-600 shrink-0" />
            <p className="text-sm font-bold text-indigo-900">Weekly 1-on-1 video sessions</p>
          </div>
          <p className="text-xs text-stone-600 leading-relaxed">
            Most aspirants take 30+ mocks but never learn to analyse one. Every week, {buddyName} breaks your mock down <span className="font-semibold text-stone-800">with you</span> — where you lost marks, why, and exactly what to fix next.
          </p>
          {nextSession && (
            <p className="text-xs font-semibold text-indigo-700 pt-0.5">
              Next session:{' '}
              {new Date(nextSession.scheduled_at).toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
              })}
            </p>
          )}
        </div>
      )}

      {!buddyId ? (
        <div className="rounded-2xl border border-stone-200 bg-stone-50 p-8 text-center">
          <p className="text-stone-600 font-medium">Finding your IIM mentor</p>
          <p className="text-sm text-stone-400 mt-1">
            We&apos;re matching you with the right mentor now — your sessions and notes will appear here within 24 hours.
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
                const minsAway = Math.round((startsAt.getTime() - now) / 60_000);
                const isCompleted = s.session_status === 'completed';
                const isOrientation = s.session_type === 'onboarding';
                const joinable = !isCompleted && minsAway <= 15 && !!s.google_meet_link;
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
                          {!isCompleted && !isOrientation && minsAway <= 7 * 1440 && (
                            <span className="shrink-0 text-[9px] font-bold bg-indigo-200 text-indigo-800 px-1.5 py-0.5 rounded-full">
                              THIS WEEK
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
                        href={s.google_meet_link!}
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
            studentId={studentId}
            buddyId={buddyId}
            buddyName={buddy?.full_name ?? 'Buddy'}
            initialFeedbacks={feedbackRows ?? []}
          />
        </>
      )}
    </div>
  );
}
