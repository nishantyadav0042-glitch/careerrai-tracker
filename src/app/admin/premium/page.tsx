import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Crown } from 'lucide-react';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { PremiumConsole } from './premium-console';

export const dynamic = 'force-dynamic';

// The one screen for "someone paid — give them their buddy". Always visible,
// never conditional: the old Manual Match panel unmounted itself whenever
// there was nothing unmatched, so the founder hunted across the panel for a
// console that had removed itself. This page lists every subscribed student
// with their buddy state, assignment inline — plus a founder-override search
// for assigning ANY student by name.

export default async function AdminPremiumPage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');
  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') redirect('/login');

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, role, full_name, phone, is_premium, premium_since, subscription_plan, subscription_renews_at, buddy_id, is_test_account, cat_percentile, college')
    .not('is_test_account', 'is', true);

  const all = profiles ?? [];
  const students = all.filter((p) => p.role === 'student');
  const buddies = all.filter((p) => p.role === 'buddy');

  const menteeCount = new Map<string, number>();
  for (const s of students) {
    if (s.buddy_id) menteeCount.set(s.buddy_id, (menteeCount.get(s.buddy_id) ?? 0) + 1);
  }
  const buddyNameById = new Map(buddies.map((b) => [b.id, b.full_name as string]));

  const toRow = (s: (typeof students)[number]) => ({
    id: s.id as string,
    name: (s.full_name as string | null) ?? '(no name)',
    phone: (s.phone as string | null) ?? null,
    isPremium: s.is_premium === true,
    plan: (s.subscription_plan as string | null) ?? null,
    premiumSince: (s.premium_since as string | null) ?? null,
    renewsAt: (s.subscription_renews_at as string | null) ?? null,
    buddyId: (s.buddy_id as string | null) ?? null,
    buddyName: s.buddy_id ? buddyNameById.get(s.buddy_id as string) ?? null : null,
  });

  const premiumRows = students.filter((s) => s.is_premium === true).map(toRow);
  const freeRows = students.filter((s) => s.is_premium !== true).map(toRow);
  const buddyRows = buddies.map((b) => ({
    id: b.id as string,
    name: (b.full_name as string | null) ?? '(no name)',
    percentile: (b.cat_percentile as number | null) ?? null,
    college: (b.college as string | null) ?? null,
    mentees: menteeCount.get(b.id as string) ?? 0,
  }));

  return (
    <div className="min-h-screen bg-stone-50 p-4">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="rounded-lg p-2 hover:bg-stone-100"><ArrowLeft className="h-5 w-5 text-stone-600" /></Link>
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-violet-600"><Crown className="h-4 w-4 text-white" /></span>
          <div>
            <h1 className="text-lg font-bold text-stone-900">Premium students — buddy console</h1>
            <p className="text-xs text-stone-500">Every subscriber, their buddy, and one-tap assignment. A paid student without a buddy is a promise not yet kept.</p>
          </div>
        </div>
        <PremiumConsole premium={premiumRows} free={freeRows} buddies={buddyRows} />
      </div>
    </div>
  );
}
