import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

// The admin door, in one place.
//
// This exact block was copy-pasted into 26 of the 32 admin pages:
//
//   const user = await getAuthUser();
//   if (!user) redirect('/login');
//   const admin = createAdminClient();
//   const { data: me } = await admin.from('profiles').select('role')...
//   if (me?.role !== 'admin') redirect('/login');
//
// Twenty-six copies of a security check is twenty-six chances to write one
// slightly differently, and the one that differs is the one nobody is looking
// at. It also made every new admin page start with six lines of ceremony,
// which is its own quiet pressure not to split a page that should be split.
//
// Returns the service-role client because every caller needs one immediately.

export async function requireAdmin() {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') redirect('/login');

  return { user, admin };
}
