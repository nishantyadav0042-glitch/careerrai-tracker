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
  const { data } = await admin.from('profiles').select('role').eq('id', user.id).single();
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
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { admin, userId: user.id };
}
