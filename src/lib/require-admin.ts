import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * True only when the current request is from a signed-in admin. Used to gate
 * admin-only API routes (e.g. config health checks) that the middleware doesn't
 * cover because it only matches page paths, not /api/admin/*.
 */
export async function isRequestAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const admin = createAdminClient();
  const { data } = await admin.from('profiles').select('role').eq('id', user.id).single();
  return data?.role === 'admin';
}
