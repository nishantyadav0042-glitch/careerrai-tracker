import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildSalesQueue } from '@/lib/sales-queue';
import { SalesDeck } from '@/components/sales-deck';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sales — Today’s Opportunities · CareerRai' };

function istHour(): number {
  const s = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false });
  return parseInt(s, 10) % 24;
}

export default async function SalesOpportunitiesPage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');
  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') redirect('/login');

  const { opportunities, target, doneToday } = await buildSalesQueue(admin);
  const hot = opportunities.filter((o) => o.tier === 'hot').length;
  const warm = opportunities.filter((o) => o.tier === 'warm').length;
  const hour = istHour();
  const primeTime = hour >= 18 && hour < 21;

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="mx-auto max-w-xl px-4 py-6 pb-24">
        <Link href="/admin" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-stone-800">
          <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
        </Link>

        <div className="rounded-2xl border border-teal-700 bg-teal-700 p-5 text-white">
          <p className="text-[11px] font-bold uppercase tracking-widest text-teal-200">Sales — Today&apos;s Opportunities</p>
          <h1 className="mt-1 text-2xl font-bold">{hot} hot · {warm} warm</h1>
          <p className="mt-1 text-sm text-teal-100">Highest conversion probability first · Rs 999 Exam Buddy · ready scripts · one tap. Target {target} conversations.</p>
          <div className={cn('mt-3 rounded-xl px-3 py-2 text-[13px] font-semibold', primeTime ? 'bg-emerald-400/20 text-emerald-100' : 'bg-white/10 text-teal-100')}>
            {primeTime ? '🟢 Prime time (6–9 PM) — highest reply rate. Start at the top.' : '⏰ Best window is 6–9 PM. Work top-down — hottest first.'}
          </div>
        </div>

        <div className="mt-4">
          {opportunities.length === 0 ? (
            <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center text-sm text-stone-500">
              No open opportunities right now. Free students who study and show buddy interest will appear here automatically.
            </div>
          ) : (
            <SalesDeck opportunities={opportunities} doneToday={doneToday} target={target} />
          )}
        </div>
      </div>
    </div>
  );
}
