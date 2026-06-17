import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthUser } from '@/lib/auth';

// Outer buddy layout: role check only.
// Shell (nav, badge) and onboarding gate live in (dashboard)/layout.tsx so that
// /buddy/setup can render without the nav and without triggering a redirect loop.
export default async function BuddyLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  // Fast path: role cookie set at login avoids a DB round-trip on every page.
  const cookieStore = await cookies();
  const roleCookie = cookieStore.get('user_role')?.value;
  if (roleCookie === 'buddy') return <>{children}</>;

  // Slow path (first load or cookie missing): verify role from DB.
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'buddy') {
    if (profile?.role === 'student') redirect('/student/tracker');
    redirect('/login');
  }

  return <>{children}</>;
}
