import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateRoomLink } from '@/lib/meeting-room-link';
import { audit } from '@/lib/integration-audit';

export const dynamic = 'force-dynamic';

// Set your permanent meeting room by hand — no Google account required.
//
// The Calendar API was only ever a way to CREATE the link. A mentor who
// already has a room can hand us the link directly and be ready to book in
// ten seconds, instead of waiting on Google's app-verification queue.
export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('role, buddy_meet_event_id').eq('id', user.id).single();
  if (profile?.role !== 'buddy') {
    return NextResponse.json({ error: 'Only buddies have a meeting room.' }, { status: 403 });
  }

  let body: { link?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const checked = validateRoomLink(typeof body.link === 'string' ? body.link : '');
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  // Overwriting a Google-minted room: drop the event id too, or cancel-meeting
  // would still treat the old calendar event as this mentor's room.
  const { error } = await admin
    .from('profiles')
    .update({
      buddy_meet_url: checked.room.url,
      buddy_meet_event_id: null,
      buddy_meet_email: null,
      buddy_meet_calendar_id: null,
    })
    .eq('id', user.id);

  if (error) {
    console.error('[room] manual room save failed:', error.message);
    return NextResponse.json({ error: "Couldn't save that link — try again." }, { status: 500 });
  }

  await audit({
    subjectId: user.id, action: 'room.created',
    detail: { manual: true, provider: checked.room.provider, replacedGoogleEvent: !!profile.buddy_meet_event_id },
  });

  return NextResponse.json({ ok: true, meetUrl: checked.room.url, provider: checked.room.provider });
}
