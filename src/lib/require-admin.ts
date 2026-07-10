import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

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
