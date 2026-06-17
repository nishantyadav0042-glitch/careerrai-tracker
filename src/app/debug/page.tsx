import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthUser } from '@/lib/auth';

// Role-aware debug redirect: students → /student/debug, others → /student/debug
// (admins can reach /student/debug via the admin client; the page doesn't enforce role)
export const dynamic = 'force-dynamic';

export default async function DebugRedirect() {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role === 'buddy') redirect('/buddy/home');
  if (profile?.role === 'admin') redirect('/admin');

  redirect('/student/debug');
}
