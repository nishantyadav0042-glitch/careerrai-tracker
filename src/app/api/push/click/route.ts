import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Click beacon from the service worker (sw.js notificationclick).
// Unauthenticated by design: a push can be tapped while the session is
// expired, and losing that click would blind the exact measurement the
// notification OS runs on. Constrained instead: the id must be a UUID, and
// clicked_at only ever sets once (first click, per Phase 8 of Notification
// Reliability V2 — a full multi-click log is out of scope for this pass).
// Worst-case abuse is marking someone's notification as clicked — a stat
// nudge, not a data leak (nothing is ever read back out).
//
// 16 Aug — REMOVED the `.not('pushed_at', 'is', null)` guard this route used
// to carry. dispatch() stamps pushed_at strictly AFTER the transport call
// resolves; a student tapping fast enough, or a beacon racing that write,
// hit this guard and lost a real click with zero trace — the audit found 23
// of 89 lifetime clicks already missing their matching receipt for exactly
// this shape of reason. A tap on a real, existing notification row is real
// regardless of exactly when pushed_at landed.
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
  const { data, error } = await admin
    .from('notifications')
    .update({ clicked_at: new Date().toISOString() })
    .eq('id', id)
    .is('clicked_at', null)
    .select('id');

  // Observability, not a response change: the beacon always gets {ok:true}
  // (an unauthenticated route must not tell a caller whether a given id is
  // real), but a click that matched nothing — unknown id, or already
  // clicked — used to vanish with zero trace anywhere. Now at least visible
  // server-side, per Phase 19 (error observability).
  if (error) console.error('[push/click] update failed:', error.message);
  else if (!data || data.length === 0) console.warn('[push/click] no matching unclicked row for id', id);

  return NextResponse.json({ ok: true });
}
