import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function Home() {
  // A demo session must never claim the bare domain. The /demo share link
  // signs the browser into the demo account with a real session, and that
  // session persists — so a visitor who once clicked the demo would forever
  // land inside it when they type the domain, instead of on login/signup.
  // The demo is only ever entered through its explicit /demo link.
  const cookieStore = await cookies();
  if (cookieStore.get('cr_demo')?.value === '1') redirect('/login');

  const user = await getAuthUser();
  if (!user) redirect('/login');

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
