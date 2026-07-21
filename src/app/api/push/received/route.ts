import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Delivery beacon from the service worker (sw.js push handler): fires the
// moment a push ARRIVES on the device — even with the app fully closed, since
// the push event wakes the SW. This is the device-level delivery proof the
// click beacon can't give (a notification can be delivered and never tapped).
// Unauthenticated by design, same as /api/push/click: the SW may hold no
// session. Constrained the same way: UUID only, sets once. Deliberately does
// NOT require pushed_at — the device often beacons back before the server
// finishes stamping its own pushed_at, and losing the race would blind us.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  let id: unknown;
  try {
    ({ id } = await request.json());
  } catch {
    // fall through to validation
  }
  if (typeof id !== 'string' || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const admin = createAdminClient();
  await admin
    .from('notifications')
    .update({ received_at: new Date().toISOString() })
    .eq('id', id)
    .is('received_at', null);

  return NextResponse.json({ ok: true });
}
