import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

export interface AuthUser {
  id: string;
  email: string | null;
}

/**
 * The authenticated user, resolved ONCE per request.
 *
 * Wrapped in React `cache()` so a layout and the page it wraps (plus any nested
 * server components) share a single auth resolution instead of each making its
 * own network round-trip to the Supabase Auth server. Uses `getClaims()`, which
 * verifies the JWT locally when the project uses asymmetric signing keys — no
 * Auth-server round-trip on warm instances.
 *
 * Security boundary: the proxy (middleware) calls `getUser()` on every request,
 * which revalidates and refreshes the session. Server components below it only
 * need the already-validated identity, which this returns cheaply.
 */
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return { id: claims.sub, email: (claims.email as string | undefined) ?? null };
});
