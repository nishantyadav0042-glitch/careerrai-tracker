import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildCallQueue } from '@/lib/call-queue';
import { CallDeck } from '@/components/call-deck';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sales — Calls · CareerRai' };

// SA-1B (20 Aug 2026): this page now consumes THE canonical queue authority —
// buildCallQueue, the same function the rep's /sales renders — instead of the
// parallel ranking that used to live in lib/sales-queue. The Part-1 forensic proved the two
// authorities used different suppression clocks and a different door signal,
// so the admin and the rep could be looking at different lists of the same
// students. One queue, two frames: the admin sees exactly what the rep sees.
//
// The generic ready-to-send script deliberately did NOT move here (founder,
// SA-1B): the card's job is who to call, why now, and what action is due —
// the personalized pitch lives on the student drill-down (/sales/student/[id]),
// which every card links to.

function istHour(): number {
  return new Date(Date.now() + 5.5 * 3600_000).getUTCHours();
}

export default async function AdminSalesPage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');
  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') redirect('/login');

  const { queue, connectedToday, dueNow } = await buildCallQueue(admin);
  const primeTime = istHour() >= 18 && istHour() < 21;

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="mx-auto max-w-xl px-4 py-6 pb-24">
        <Link href="/admin" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-stone-800">
          <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
        </Link>

        <div className="rounded-2xl border border-teal-700 bg-teal-700 p-5 text-white">
          <p className="text-[11px] font-bold uppercase tracking-widest text-teal-200">Sales — the calling queue</p>
          <h1 className="mt-1 text-2xl font-bold">{connectedToday > 0 ? `${connectedToday} connected today` : 'Today’s calls'}</h1>
          <p className="mt-1 text-sm text-teal-100">
            {dueNow > 0 ? `${dueNow} callbacks/retries due now · ` : ''}{queue.length} in the queue, highest priority first — the same list the rep works.
          </p>
          <div className={cn('mt-3 rounded-xl px-3 py-2 text-[13px] font-semibold', primeTime ? 'bg-emerald-400/20 text-emerald-100' : 'bg-white/10 text-teal-100')}>
            {primeTime ? '🟢 Prime calling hours (6–9 PM) — best pickup.' : '⏰ Best pickup is 6–9 PM. Due callbacks and hottest leads first.'}
          </div>
        </div>

        <div className="mt-4">
          {queue.length === 0 ? (
            <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center text-sm text-stone-500">
              No one to call right now. Callbacks and fresh leads roll in through the day.
            </div>
          ) : (
            <CallDeck queue={queue} />
          )}
        </div>
      </div>
    </div>
  );
}
