import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

/**
 * True only when the current request is from a signed-in admin. Used to gate
 * admin-only API routes (e.g. config health checks). Identity comes from
 * getAuthUser() — local, signature-verified JWT claims — because the
 * middleware already made the network auth round-trip (and refreshed the
 * token) for this same request; the role check itself stays a DB read.
 */
export async function isRequestAdmin(): Promise<boolean> {
  const user = await getAuthUser();
  if (!user) return false;
  const admin = createAdminClient();
  const { data, error } = await admin.from('profiles').select('role').eq('id', user.id).single();
  // A failed read is not a "no" — but this helper returns a boolean, so the
  // safe answer here is false. Callers that must distinguish the two use
  // requireAdminCtx below, which reports a 503 instead of a 403.
  if (error) console.error('[isRequestAdmin] role read failed:', error.message);
  return data?.role === 'admin';
}

/**
 * THE admin gate for API routes. Before the 26 Jul audit this exact function
 * was declared locally in seven admin routes (plus twelve more inline
 * variants) — and the copies had already drifted on status codes and error
 * bodies. One implementation, one contract: 401 'Unauthorized' when not
 * signed in, 403 'Forbidden' when signed in but not an admin, otherwise the
 * service-role client + userId.
 *
 * Usage: const ctx = await requireAdminCtx(); if ('error' in ctx) return ctx.error;
 */
export async function requireAdminCtx(): Promise<
  { error: NextResponse } | { admin: ReturnType<typeof createAdminClient>; userId: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const admin = createAdminClient();
  const { data: profile, error } = await admin.from('profiles').select('role').eq('id', user.id).single();
  // 503, not 403 (21 Aug). A profiles read that FAILED tells us nothing about
  // this user's rights; answering 403 would state as fact something we do not
  // know, and on a page gate the same mistake logs a real admin out.
  if (error) {
    console.error('[requireAdminCtx] role read failed:', error.message);
    return { error: NextResponse.json({ error: 'Could not verify access — try again.' }, { status: 503 }) };
  }
  if (profile?.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { admin, userId: user.id };
}
