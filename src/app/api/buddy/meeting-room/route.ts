import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateRoomLink } from '@/lib/meeting-room-link';
import { audit } from '@/lib/integration-audit';

export const dynamic = 'force-dynamic';

// ── A MENTOR SETS THEIR OWN MEETING ROOM ───────────────────────────────────
//
// Restored 5 Sep 2026. This route was removed on 27 Aug when Google became the
// only mentor setup path. That path is currently impassable: our OAuth app
// requests the sensitive calendar.events scope, Google has not verified it, and
// every mentor meets a red "Google hasn't verified this app" interstitial. On
// 5 Sep a mentor with three students and a paid session credit waiting refused
// to click through it — correctly; that screen tells her not to. Zero of seven
// mentors were connected, so nobody could be booked at all.
//
// The admin twin (/api/admin/set-buddy-room) survived the removal, which meant
// the founder could set a room FOR a mentor while the mentor could not set
// their own. That is the wrong way round for a part-time mentor at 9pm.
//
// Same validation as the admin route — `validateRoomLink` — because TRUST-OS's
// law is "never hand out a link we can't verify", and that law is about the
// link being checkable, not about who pasted it.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
  // Mentors only. An admin setting someone else's room uses the admin route,
  // which takes a buddy_id; this one can only ever write the caller's own.
  if (me?.role !== 'buddy') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: { link?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const raw = typeof body.link === 'string' ? body.link : '';

  // Clearing is deliberate and allowed: a mentor who connects Google later, or
  // whose room dies, must be able to take it down rather than leave a link that
  // will fail a student at meeting time.
  if (raw.trim() === '') {
    const { error } = await admin
      .from('profiles').update({ buddy_meet_url: null }).eq('id', user.id);
    if (error) {
      console.error('[buddy/meeting-room] clear failed:', error.message);
      return NextResponse.json({ error: 'Could not save. Try again.' }, { status: 500 });
    }
    await audit({ subjectId: user.id, actorId: user.id, action: 'room.regenerated', detail: { cleared: true } });
    return NextResponse.json({ ok: true, roomUrl: null });
  }

  const check = validateRoomLink(raw);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  const { error } = await admin
    .from('profiles').update({ buddy_meet_url: check.room.url }).eq('id', user.id);
  if (error) {
    console.error('[buddy/meeting-room] update failed:', error.message);
    return NextResponse.json({ error: 'Could not save. Try again.' }, { status: 500 });
  }

  await audit({ subjectId: user.id, actorId: user.id, action: 'room.created', detail: { self_served: true } });
  return NextResponse.json({ ok: true, roomUrl: check.room.url });
}
