import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Click beacon from the service worker (sw.js notificationclick).
// Unauthenticated by design: a push can be tapped while the session is
// expired, and losing that click would blind the exact measurement the
// notification OS runs on. Constrained instead: the id must be a UUID, the
// row must actually have been pushed, and clicked_at only ever sets once.
// Worst-case abuse is marking someone's notification as clicked — a stat
// nudge, not a data leak (nothing is ever read back out).
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
    .update({ clicked_at: new Date().toISOString() })
    .eq('id', id)
    .is('clicked_at', null)
    .not('pushed_at', 'is', null);

  return NextResponse.json({ ok: true });
}
