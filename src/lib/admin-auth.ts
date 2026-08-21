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
//
// "I COULD NOT READ YOUR ROLE" IS NOT "YOU ARE NOT AN ADMIN" (21 Aug).
// The founder tapped Buddies in the admin panel and was thrown to the login
// screen. Supabase auth logs for that minute are all 200 — the session was
// perfectly healthy and was never rejected. The bounce came from the line
// below, which read `data` and ignored `error`: one flaky profiles read, and
// a signed-in admin is told to log in again.
//
// That is the same failure this codebase keeps paying for — a system failure
// rendered as a confident negative answer. An authorization decision may only
// be made from an answer we actually received.
//
// So: retry once (transient blips vanish), and if the read still fails, THROW
// rather than redirect. An error boundary says "something broke"; a login
// screen lies and says "you don't belong here".

async function readRole(admin: ReturnType<typeof createAdminClient>, userId: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await admin.from('profiles').select('role').eq('id', userId).single();
    if (!error) return data?.role ?? null;
    if (attempt === 1) {
      console.error('[requireAdmin] role read failed twice:', error.message);
      throw new Error('Could not verify admin access — the profile lookup failed.');
    }
  }
  return null;
}

export async function requireAdmin() {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const role = await readRole(admin, user.id);
  // A role we DID read, that is not admin — a real authorization answer.
  if (role !== 'admin') redirect('/login');

  return { user, admin };
}
