import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthUser } from '@/lib/auth';
import { BuddyTriageView } from './buddy-triage-view';
import { MeetingWidget } from '@/components/meeting-widget';
import { buddyBookingReadiness } from '@/lib/buddy-room';
import { GoogleConnect } from '@/components/buddy/google-connect';
import { UrgentRequestsPanel } from './urgent-requests-panel';
import { CheckInDrafts } from './checkin-drafts';
import { checkInBecause, type CheckInSignal } from '@/lib/os/buddy-checkin';
import { Settings, LogOut, Plus } from 'lucide-react';
import Link from 'next/link';

export default async function BuddyHomePage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // The Google round-trip bounces back here with ?google=... — dropping it
  // (as this page did) turned every connect failure into a silent page
  // reload, which reads as "nothing is working" (founder, tonight).
  const params = await searchParams;
  const googleStatus = typeof params.google === 'string' ? params.google : null;
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  // The students + pending-requests reads depend only on user.id, not on the
  // profile/role gate, so they ride in the same wave as the profile fetch rather
  // than waiting behind it. On the rare non-buddy redirect path the two extra
  // reads are wasted; on every real buddy load we save a serial round-trip.
  const [{ data: profile }, { data: students }, { data: pendingRequests }, { data: checkinDrafts }, readiness] = await Promise.all([
    admin
      .from('profiles')
      .select('role, full_name, avatar_url, linkedin_url, iim_converted, strongest_section, how_i_work, biggest_mistake, current_company')
      .eq('id', user.id)
      .single(),
    admin
      .from('profiles')
      .select('id, full_name')
      .eq('buddy_id', user.id)
      .order('full_name'),
    admin
      .from('session_requests')
      .select('id, student_id, message, created_at, profiles!session_requests_student_id_fkey(full_name)')
      .eq('buddy_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    // Check-in drafts waiting on this mentor. Expired ones are filtered HERE
    // rather than cleaned up by a cron: a draft whose facts have gone stale
    // must stop being sendable the moment it goes stale, not whenever a sweep
    // next runs.
    admin
      .from('buddy_checkin_drafts')
      .select('id, student_id, draft_body, signal, evidence, missed_days, profiles!buddy_checkin_drafts_student_id_fkey(full_name)')
      .eq('buddy_id', user.id)
      .is('sent_at', null)
      .is('dismissed_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('missed_days', { ascending: false }),
    // Same readiness the booking API enforces with, so the Schedule button and
    // the server never disagree about whether this mentor can book.
    buddyBookingReadiness(user.id),
  ]);

  // The role gate lives in /buddy/layout.tsx (requireBuddy). What is left
  // here is a DATA requirement, not an access decision: this page renders the
  // mentor's own profile and cannot draw it from nothing. A missing row is an
  // error to surface, never a quiet redirect that reads as a logout.
  if (!profile) throw new Error('Could not load your mentor profile — please retry.');

  // Students now browse buddy profiles before subscribing — an incomplete
  // profile is money left on the table. Nudge until every field is filled.
  const missingItems = [
    !profile.avatar_url && 'photo',
    !profile.linkedin_url && 'LinkedIn',
    !profile.iim_converted && 'IIM/college',
    !profile.strongest_section && 'strongest section',
    !profile.how_i_work && 'working style',
    !profile.biggest_mistake && 'your story',
    !profile.current_company && 'company',
  ].filter(Boolean) as string[];
  const completenessPct = Math.round(((7 - missingItems.length) / 7) * 100);
  const showProfileNudge = missingItems.length > 0;

  const firstName = profile?.full_name?.split(' ')[0] ?? 'Buddy';

  return (
    <div className="space-y-4">
      {/* Greeting row — sits naturally below the layout's Logo/badge header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-stone-500 font-medium">Welcome back</p>
          <h1 className="text-lg font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
            {firstName}
          </h1>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Link
            href="/buddy/schedule"
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-teal-700 text-white hover:bg-teal-800 rounded-lg transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Schedule</span>
          </Link>
          <Link
            href="/buddy/settings"
            className="p-2 text-stone-600 hover:bg-stone-100 rounded-lg transition-colors"
          >
            <Settings className="w-4 h-4" />
          </Link>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="p-2 text-stone-600 hover:bg-stone-100 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      {/* Profile completeness — students pick buddies from these profiles */}
      {showProfileNudge && (
        <Link
          href="/buddy/setup"
          className="block rounded-xl border border-amber-200 bg-amber-50 p-4 hover:bg-amber-100/70 transition-colors"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-amber-900">Your profile is {completenessPct}% complete</p>
              <p className="text-xs text-amber-800 mt-0.5">
                Students choose their buddy from these profiles. Missing: {missingItems.join(', ')}.
              </p>
            </div>
            <span className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white">
              Complete it →
            </span>
          </div>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-amber-200/70">
            <div className="h-full rounded-full bg-amber-600" style={{ width: `${completenessPct}%` }} />
          </div>
        </Link>
      )}

      {/* Setup — on the HOME screen, not buried in the profile. A mentor who
          cannot book needs to see the reason and the fix on the first screen
          they land on, not discover it three taps deep after filling in a
          booking form. Disappears the moment it's done.

          TWO THINGS, KEPT SEPARATE (founder, 27 Aug): connect Google, and set
          your availability. They are different problems with different fixes,
          so merging them into one card — as the old room/Google/hours screen
          did — only ever told a mentor "something is wrong" without saying
          which thing. Each renders only while its own step is outstanding. */}
      {!readiness.ready && (
        <div className="space-y-3">
          {(!readiness.googleConnected || !readiness.hasRoom) && (
            <GoogleConnect
              googleConnected={readiness.googleConnected}
              hasRoom={readiness.hasRoom}
              googleEmail={readiness.googleEmail}
              from="/buddy/home"
              googleStatus={googleStatus}
            />
          )}
          {!readiness.hasAvailability && (
            <Link
              href="/buddy/schedule"
              className="flex items-center gap-3 rounded-2xl border-2 border-orange-300 bg-orange-50 p-4"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-orange-500">
                <Plus className="h-4 w-4 text-white" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-stone-900">Set your availability</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-stone-600">
                  Students can only pick times you have opened.
                </p>
              </div>
              <span className="shrink-0 rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white">
                Set hours →
              </span>
            </Link>
          )}
        </div>
      )}

      {/* Next session widget */}
      <MeetingWidget
        role="buddy"
        students={students ?? []}
        calendarConnected={readiness.ready}
      />

      {/* 🚨 URGENT: Session requests from students */}
      {(pendingRequests?.length ?? 0) > 0 && (
        <UrgentRequestsPanel
          requests={(pendingRequests ?? []).map((r) => ({
            id: r.id,
            studentId: r.student_id,
            studentName: (r.profiles as { full_name?: string } | null)?.full_name ?? 'Student',
            message: r.message,
            createdAt: r.created_at,
          }))}
        />
      )}



      {/* Students who went quiet — one tap sends the message as the mentor */}
      {(checkinDrafts?.length ?? 0) > 0 && (
        <CheckInDrafts
          drafts={(checkinDrafts ?? []).map((d) => ({
            id: d.id,
            studentId: d.student_id,
            studentName: ((d.profiles as { full_name?: string } | null)?.full_name ?? 'Student').split(' ')[0],
            body: d.draft_body,
            missedDays: d.missed_days,
            because: checkInBecause(
              d.signal as CheckInSignal,
              (d.evidence ?? {}) as Record<string, unknown>
            ),
          }))}
        />
      )}

      {/* Student overview — stat tiles + urgency-ranked cards */}
      <section>
        <p className="text-[10px] uppercase tracking-widest font-bold text-stone-500 mb-2 px-1">Student overview</p>
        <BuddyTriageView buddyId={user.id} />
      </section>

      <p className="text-center text-xs text-stone-400 pb-4">
        Focus on high urgency students first — they need you most.
      </p>
    </div>
  );
}
