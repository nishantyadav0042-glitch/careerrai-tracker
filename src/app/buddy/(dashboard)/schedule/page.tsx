import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { MeetingWidget } from '@/components/meeting-widget';
import { MeetingRoomSetup } from '@/components/buddy/meeting-room-setup';
import { buddyBookingReadiness } from '@/lib/buddy-room';

export default async function BuddySchedulePage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'buddy') redirect('/');

  const [{ data: students }, readiness] = await Promise.all([
    admin.from('profiles').select('id, full_name').eq('buddy_id', user.id).order('full_name'),
    // Booking needs BOTH a live Google connection and a permanent room. Asking
    // for the full readiness — rather than just "is a token present" — is what
    // catches the mentor whose grant died since their last visit, or whose room
    // was never minted because Google was down that minute.
    buddyBookingReadiness(user.id),
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
        {/* Pasting a link beats waiting on Google's verification queue, so it
            leads. Google stays available as the "make one for me" shortcut. */}
        <MeetingRoomSetup currentRoom={readiness.roomUrl} from="/buddy/schedule" />
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
