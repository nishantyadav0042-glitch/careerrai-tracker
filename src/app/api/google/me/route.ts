import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { buddyBookingReadiness } from '@/lib/buddy-room';
import { googleConfigured } from '@/lib/google-oauth';

export const dynamic = 'force-dynamic';

// "Can I book right now?" — for client components.
//
// There were three different answers to this question in the app: a legacy
// `profiles.google_calendar_connected` column (never written any more, so the
// triage list always said "not connected"), a token-presence check on the
// student page, and the real readiness on the schedule page. Three sources,
// three answers, and the mentor got whichever screen they happened to open.
//
// This is the one source, and it is the SAME function the booking API enforces
// with — so the button and the server can never disagree.
//
// Returns booleans and an email address. No token, no calendar id, ever.
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const readiness = await buddyBookingReadiness(user.id);
  return NextResponse.json({
    // Whether the SERVER has Google credentials at all — the difference
    // between "you haven't connected" and "nobody could connect if they
    // tried", which tonight took an hour to tell apart from the outside.
    configured: googleConfigured(),
    ready: readiness.ready,
    connected: readiness.googleConnected,
    hasRoom: readiness.hasRoom,
    roomUrl: readiness.roomUrl,
    email: readiness.googleEmail,
    blocker: readiness.blocker,
  });
}
