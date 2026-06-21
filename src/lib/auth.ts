import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

export interface AuthUser {
  id: string;
  email: string | null;
}

// Identity for protected pages. Prefer getClaims() — it verifies the JWT
// cryptographically but LOCALLY (cached JWKS) when the project uses asymmetric
// signing keys, avoiding a per-request network round-trip to Supabase Auth.
// The proxy/middleware still calls getUser() once per request (validates AND
// refreshes the session), so by the time a page runs the cookie token is fresh
// and getClaims() can verify it offline. Falls back to getUser() if getClaims
// is unavailable or yields no subject, so authentication never weakens.
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase.auth.getClaims();
    const claims = data?.claims as { sub?: string; email?: string } | undefined;
    if (!error && claims?.sub) {
      return { id: claims.sub, email: claims.email ?? null };
    }
  } catch {
    // fall through to getUser()
  }

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return { id: user.id, email: user.email ?? null };
});
