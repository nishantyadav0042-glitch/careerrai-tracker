import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { MeetingWidget } from '@/components/meeting-widget';
import { GoogleConnect } from '@/components/buddy/google-connect';
import { SessionReadiness } from '@/components/buddy/session-readiness';
import { buddyBookingReadiness } from '@/lib/buddy-room';

export default async function BuddySchedulePage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const googleStatus = typeof params.google === 'string' ? params.google : null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  // The role gate lives in /buddy/layout.tsx (requireBuddy). Deciding again
  // here from a read that may have failed can only misfire — a flaky profiles
  // read would bounce a real buddy, which is exactly the 21 Aug defect.

  const [{ data: students }, readiness, { data: availabilityRow }] = await Promise.all([
    admin.from('profiles').select('id, full_name').eq('buddy_id', user.id).order('full_name'),
    // Booking needs BOTH a live Google connection and a permanent room. Asking
    // for the full readiness — rather than just "is a token present" — is what
    // catches the mentor whose grant died since their last visit, or whose room
    // was never minted because Google was down that minute.
    buddyBookingReadiness(user.id),
    // The mentor's described week. Absent means NOT bookable — students see a
    // team-confirmation path rather than an empty picker.
    admin.from('buddy_availability').select('*').eq('buddy_id', user.id).maybeSingle(),
  ]);

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="bg-white border-b border-stone-200">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link
            href="/buddy/home"
            className="p-2 hover:bg-stone-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-stone-600" />
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-stone-900">Sessions</h1>
            <p className="text-sm text-stone-600">Schedule video sessions with your students</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Connect Google leads, and it is the ONLY meeting-infrastructure
            path a mentor sees. The paste-your-own-room card that used to sit
            below this was the second visible way to configure the same thing;
            removing it is the 27 Aug simplification. */}
        <GoogleConnect
          googleConnected={readiness.googleConnected}
          hasRoom={readiness.hasRoom}
          googleEmail={readiness.googleEmail}
          from="/buddy/schedule"
          googleStatus={googleStatus}
        />
        <SessionReadiness
          canBook={readiness.ready}
          availability={{
            configured: availabilityRow != null,
            work_days: (availabilityRow?.work_days as number[] | undefined),
            start_minute: (availabilityRow?.start_minute as number | undefined),
            end_minute: (availabilityRow?.end_minute as number | undefined),
            slot_minutes: (availabilityRow?.slot_minutes as number | undefined),
            buffer_minutes: (availabilityRow?.buffer_minutes as number | undefined),
            active: (availabilityRow?.active as boolean | undefined),
          }}
        />
        {/* The widget is ALWAYS shown now. Hiding it when Google was not
            connected meant a mentor lost the whole surface and had to go find
            the connect button elsewhere; the modal itself now leads with
            Connect and keeps the Book button disabled until it works. Blocking
            the path is right — hiding it is not. */}
        <MeetingWidget role="buddy" students={students ?? []} calendarConnected={readiness.ready} />
      </div>
    </div>
  );
}
