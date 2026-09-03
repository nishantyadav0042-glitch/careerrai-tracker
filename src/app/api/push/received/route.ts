import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { confirmDelivery } from '@/lib/notification-endpoints';

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
  let endpointId: unknown;
  try {
    ({ id, endpointId } = await request.json());
  } catch {
    // fall through to validation
  }
  if (typeof id !== 'string' || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data: row } = await admin
    .from('notifications')
    .update({ received_at: now })
    .eq('id', id)
    .is('received_at', null)
    .select('user_id')
    .single();

  // Device-level delivery is the ONLY true proof of health — stamp it on the
  // profile so the health engine can score "verified delivery, not just
  // accepted by the push service."
  if (row?.user_id) {
    await admin.from('profiles').update({ push_verified_at: now }).eq('id', row.user_id as string);
  }

  // ── WHICH DEVICE DISPLAYED IT (task #79) ──────────────────────────────────
  //
  // Everything above is student-level and is left exactly as it was: a student
  // with no registry row (still on the legacy fallback column) sends no
  // endpointId, takes none of this, and behaves precisely as before.
  //
  // When the id IS present, it names the endpoint this copy was sent to.
  // It is NOT trusted: confirmDelivery re-derives ownership from our own rows
  // and refuses any pair whose notification and endpoint belong to different
  // students, or either of which we do not recognise. A refusal is reported
  // as a status, never as an error — the student-level receipt above is
  // already banked and must not be undone by a bad or stale device id.
  let device: 'confirmed' | 'already' | 'rejected' | 'absent' = 'absent';
  if (typeof endpointId === 'string' && UUID_RE.test(endpointId)) {
    device = await confirmDelivery(admin, id, endpointId);
  }

  return NextResponse.json({ ok: true, device });
}
