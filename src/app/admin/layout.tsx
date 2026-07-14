import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminNav } from './admin-nav';

// One shell for every admin screen: auth gate + the shared nav bar. Pages
// keep their own role checks (defense in depth for anything hit directly),
// but no admin page renders its own Logo/Logout header anymore.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser();
  if (!user) redirect('/login');
  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') redirect('/login');

  return (
    <div className="min-h-screen bg-stone-50">
      <AdminNav />
      {children}
    </div>
  );
}
