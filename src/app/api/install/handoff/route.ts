import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { encryptHandoff } from '@/lib/session-handoff-crypto';

// Mints a one-time, 15-minute hand-off of the CURRENT web session so it can be
// carried into an installed iOS PWA (which has separate cookie storage and is
// otherwise logged out). Returns a URL the caller navigates to before "Add to
// Home Screen"; only the installed (standalone) app consumes it. The session
// tokens are encrypted at rest and the row is single-use.
export async function POST(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
  );

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token || !session?.refresh_token) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const token = crypto.randomBytes(24).toString('base64url');
  const payload = encryptHandoff(JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  }));
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const admin = createAdminClient();
  const { error } = await admin.from('pwa_session_handoff').insert({
    token,
    user_id: session.user.id,
    payload,
    expires_at: expiresAt,
  });
  if (error) return NextResponse.json({ error: 'Could not prepare install' }, { status: 500 });

  return NextResponse.json({ url: `/app?k=${token}` });
}
