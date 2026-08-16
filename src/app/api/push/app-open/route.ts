import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// The other half of app-open attribution: sw.js's notificationclick handler
// carries the tapped notification's own id through either a URL query param
// (cold start / openWindow) or a postMessage (already-open / focus) — see
// public/sw.js and components/notification-attribution.tsx. This route is
// the ONLY writer of app_opened_at, and it writes ONLY when handed that
// exact id — never inferred from "the student was active afterward".
//
// Unauthenticated by design, same reasoning as /api/push/click: the app can
// be opening from a cold, signed-out-looking state at the exact moment this
// fires, and losing the attribution because a session cookie hadn't
// rehydrated yet would defeat the entire point. Constrained the same way:
// id must be a real UUID, and the row must exist.
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
    .update({ app_opened_at: new Date().toISOString() })
    .eq('id', id)
    .is('app_opened_at', null)
    .select('id');

  if (error) console.error('[push/app-open] update failed:', error.message);
  else if (!data || data.length === 0) console.warn('[push/app-open] no matching unattributed row for id', id);

  return NextResponse.json({ ok: true });
}
