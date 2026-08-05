import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthUser } from '@/lib/auth';
import { BuddyTriageView } from './buddy-triage-view';
import { MeetingWidget } from '@/components/meeting-widget';
import { buddyBookingReadiness } from '@/lib/buddy-room';
import { GoogleConnectCard } from '@/components/google-connect-card';
import { UrgentRequestsPanel } from './urgent-requests-panel';
import { Settings, LogOut, Plus } from 'lucide-react';
import Link from 'next/link';

export default async function BuddyHomePage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  // The students + pending-requests reads depend only on user.id, not on the
  // profile/role gate, so they ride in the same wave as the profile fetch rather
  // than waiting behind it. On the rare non-buddy redirect path the two extra
  // reads are wasted; on every real buddy load we save a serial round-trip.
  const [{ data: profile }, { data: students }, { data: pendingRequests }, readiness] = await Promise.all([
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
    // Same readiness the booking API enforces with, so the Schedule button and
    // the server never disagree about whether this mentor can book.
    buddyBookingReadiness(user.id),
  ]);

  if (profile?.role !== 'buddy') redirect('/');

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

      {/* Connect Google — on the HOME screen, not buried in the profile.
          A mentor who cannot book needs to see the reason and the fix on the
          first screen they land on, not discover it three taps deep after
          filling in a booking form. Disappears the moment it's done. */}
      {!readiness.ready && (
        <GoogleConnectCard connected={readiness.googleConnected} email={readiness.googleEmail} from="/buddy/home" />
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
