import { cache } from 'react';
import { after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export interface AuthUser {
  id: string;
  email: string | null;
}

// Presence stamp: profiles.last_seen_at powers the admin dashboard's
// "inactive buddies / students" counts. Throttled in SQL (only rows staler
// than 1h match, so at most one tiny write per user per hour), scheduled
// via after() so it never adds latency to the request, and failure-proof —
// presence is telemetry, never worth breaking auth over.
function touchLastSeen(userId: string) {
  try {
    after(async () => {
      try {
        const cutoff = new Date(Date.now() - 3600_000).toISOString();
        await createAdminClient()
          .from('profiles')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('id', userId)
          .or(`last_seen_at.is.null,last_seen_at.lt.${cutoff}`);
      } catch { /* best-effort */ }
    });
  } catch { /* after() unavailable outside request scope — skip silently */ }
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
      touchLastSeen(claims.sub);
      return { id: claims.sub, email: claims.email ?? null };
    }
  } catch {
    // fall through to getUser()
  }

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  touchLastSeen(user.id);
  return { id: user.id, email: user.email ?? null };
});
