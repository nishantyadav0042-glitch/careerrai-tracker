import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeStoreSource } from '@/lib/store-build';

export const dynamic = 'force-dynamic';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const cookieStore = await cookies();
  const params = await searchParams;

  // A store wrapper launching on "/?source=ios" hands the flag to the proxy,
  // which turns it into the cr_store cookie — but this redirect drops the query
  // string, so if that cookie were ever missed on the first hop the flag would
  // be gone for good (no install-banner suppression, no payment escape). Carry
  // the param onto /welcome so the proxy gets a second, guaranteed chance at it.
  // Only the two accepted values propagate (normalizeStoreSource is the one
  // list) — an arbitrary ?source= value is never reflected into a redirect.
  const raw = params.source;
  const source = normalizeStoreSource(Array.isArray(raw) ? raw[0] : raw);

  const user = await getAuthUser();
  if (!user) redirect(source ? `/welcome?source=${source}` : '/welcome');

  // Fast path: role cookie set at login — no DB round-trip needed.
  const role = cookieStore.get('user_role')?.value;
  if (role === 'buddy') redirect('/buddy/home');
  if (role === 'admin') redirect('/admin');
  if (role === 'sales') redirect('/sales');
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
  if (profile?.role === 'sales') redirect('/sales');
  redirect('/student/tracker');
}
