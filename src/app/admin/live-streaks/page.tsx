import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStreaksAlive } from '@/lib/admin-filters';
import { ArrowLeft, Flame, Shield } from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Streaks alive · CareerRai' };

// The list behind the "Streaks alive" card: every student whose momentum
// streak is ≥1 right now — actively logging (today/yesterday) or protected by
// Momentum Shields through missed days. Same shared filter as the dashboard
// count (lib/admin-filters.ts).
export default async function StreaksAlivePage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');
  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') redirect('/login');

  const list = await getStreaksAlive(admin);
  const activeCount = list.filter((r) => r.active).length;

  return (
    <div className="mx-auto max-w-2xl px-4 py-5 pb-20">
      <Link href="/admin" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-stone-800">
        <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
      </Link>
      <div className="mb-4 px-1">
        <h1 className="text-xl font-bold tracking-tight text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>Streaks alive</h1>
        <p className="mt-0.5 text-xs text-stone-500">
          {list.length} {list.length === 1 ? 'streak' : 'streaks'} alive — {activeCount} actively logging, {list.length - activeCount} held safe by shields. Active first, longest first.
        </p>
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center text-sm text-stone-500">
          No streaks alive right now.
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white p-3.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[15px] font-bold text-stone-900">{r.full_name ?? 'Student'}</span>
                  {!r.active && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-700">
                      <Shield className="h-3 w-3" /> shield-protected
                    </span>
                  )}
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-stone-400">{r.phone ?? 'no phone'} · last log {r.lastLogDate}</div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-700">
                  <Flame className="h-3 w-3" />{r.streak}-day
                </span>
                <span className="inline-flex items-center gap-0.5 rounded-full bg-stone-100 px-2 py-1 text-[11px] font-bold text-stone-600">
                  <Shield className="h-3 w-3" />{r.shields}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
