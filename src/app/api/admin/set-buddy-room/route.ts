import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateRoomLink } from '@/lib/meeting-room-link';
import { audit } from '@/lib/integration-audit';

export const dynamic = 'force-dynamic';

// Set a mentor's meeting room ON THEIR BEHALF, from the Buddy 360.
//
// "Cannot run a session" — a mentor with students and no room — is a P0 the
// founder must be able to clear from the surface that reports it, not by asking
// the mentor to log in and do it themselves while a paid student waits. This is
// the admin twin of /api/buddy/meeting-room: same link validation, same profile
// write, but keyed on a buddy_id and gated to admins.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: { buddy_id?: unknown; link?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const buddyId = typeof body.buddy_id === 'string' ? body.buddy_id : '';
  if (!buddyId) return NextResponse.json({ error: 'Missing buddy_id' }, { status: 400 });

  // The target must actually be a buddy — never let this write a room onto a
  // student or admin profile.
  const { data: target } = await admin.from('profiles').select('role, buddy_meet_event_id').eq('id', buddyId).single();
  if (target?.role !== 'buddy') return NextResponse.json({ error: 'Not a mentor.' }, { status: 400 });

  const checked = validateRoomLink(typeof body.link === 'string' ? body.link : '');
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  const { error } = await admin
    .from('profiles')
    .update({
      buddy_meet_url: checked.room.url,
      buddy_meet_event_id: null,
      buddy_meet_email: null,
      buddy_meet_calendar_id: null,
    })
    .eq('id', buddyId);
  if (error) {
    console.error('[admin room] save failed:', error.message);
    return NextResponse.json({ error: "Couldn't save that link — try again." }, { status: 500 });
  }

  await audit({
    subjectId: buddyId, action: 'room.created',
    detail: { manual: true, byAdmin: user.id, provider: checked.room.provider, replacedGoogleEvent: !!target.buddy_meet_event_id },
  });

  return NextResponse.json({ ok: true, meetUrl: checked.room.url, provider: checked.room.provider });
}
