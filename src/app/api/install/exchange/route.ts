import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { decryptHandoff } from '@/lib/session-handoff-crypto';

// Consumes a one-time PWA hand-off token (see /api/install/handoff) and
// establishes the session in THIS context — the installed iOS PWA. The token
// is single-use and short-TTL; the tokens inside are decrypted server-side and
// applied as httpOnly auth cookies via setSession, so they never live in the
// app's JS.
export async function POST(request: NextRequest) {
  const { token } = (await request.json().catch(() => ({}))) as { token?: string };
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const admin = createAdminClient();
  const { data: row } = await admin
    .from('pwa_session_handoff')
    .select('user_id, payload, expires_at, used')
    .eq('token', token)
    .maybeSingle();

  if (!row || row.used || new Date(row.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'Link expired — please log in.' }, { status: 401 });
  }
  // Burn it immediately (single-use), before doing anything else.
  await admin.from('pwa_session_handoff').update({ used: true }).eq('token', token);

  const decrypted = decryptHandoff(row.payload);
  if (!decrypted) return NextResponse.json({ error: 'Invalid link' }, { status: 401 });
  const { access_token, refresh_token } = JSON.parse(decrypted) as { access_token: string; refresh_token: string };

  const pending: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => toSet.forEach(({ name, value, options }) => pending.push({ name, value, options: options as Record<string, unknown> })),
      },
    }
  );

  const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error || !data.session) {
    return NextResponse.json({ error: 'Session could not be restored — please log in.' }, { status: 401 });
  }

  const { data: profile } = await admin.from('profiles').select('role').eq('id', row.user_id).single();
  const role = (profile?.role as string | null) ?? 'student';
  const dest = role === 'admin' ? '/admin' : role === 'buddy' ? '/buddy/students' : '/student/tracker';

  const res = NextResponse.json({ ok: true, dest });
  pending.forEach(({ name, value, options }) => res.cookies.set(name, value, options as Parameters<typeof res.cookies.set>[2]));
  if (role === 'student' || role === 'buddy' || role === 'admin') {
    res.cookies.set('user_role', role, { path: '/', sameSite: 'lax', httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 30 });
  }
  return res;
}
