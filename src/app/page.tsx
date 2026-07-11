import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const cookieStore = await cookies();

  const user = await getAuthUser();
  if (!user) redirect('/welcome');

  // Fast path: role cookie set at login — no DB round-trip needed.
  const role = cookieStore.get('user_role')?.value;
  if (role === 'buddy') redirect('/buddy/home');
  if (role === 'admin') redirect('/admin');
  if (role === 'student') redirect('/student/tracker');

  // Slow path (cookie missing): look up role from DB.
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role === 'buddy') redirect('/buddy/home');
  if (profile?.role === 'admin') redirect('/admin');
  redirect('/student/tracker');
}
