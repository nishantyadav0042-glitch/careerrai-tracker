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

export async function readRole(admin: ReturnType<typeof createAdminClient>, userId: string) {
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
  // A role we DID read, that is not admin — a real authorization answer, so
  // send them where they actually belong. /login is reserved for someone we
  // genuinely cannot identify; a signed-in student does not belong there.
  if (role !== 'admin') redirect(homeForRole(role));

  return { user, admin };
}

/**
 * Where a signed-in person belongs when they are not allowed here.
 *
 * Sending someone to /login when we KNOW their role is its own small lie —
 * they are signed in, they just took a wrong door. Only an unknown or
 * role-less account genuinely belongs at the login screen.
 */
export function homeForRole(role: string | null): string {
  if (role === 'admin') return '/admin';
  if (role === 'student') return '/student/tracker';
  if (role === 'buddy') return '/buddy/home';
  if (role === 'sales') return '/sales';
  return '/login';
}

/**
 * The buddy door. Same honesty contract as requireAdmin: a role we could not
 * READ throws, a role we read and that is wrong redirects to where that
 * person actually belongs.
 */
export async function requireBuddy() {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const role = await readRole(admin, user.id);
  if (role !== 'buddy') redirect(homeForRole(role));

  return { user, admin };
}

/**
 * The sales door. Admins pass too — they can see everything, and an admin
 * bounced out of the sales workspace would be a worse bug than the one this
 * file exists to fix.
 */
export async function requireSales() {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const role = await readRole(admin, user.id);
  if (role !== 'sales' && role !== 'admin') redirect(homeForRole(role));

  return { user, admin, role };
}
