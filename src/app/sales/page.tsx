import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { cn } from '@/lib/utils';
import { buildCallQueue } from '@/lib/call-queue';
import { CallDeck } from '@/components/call-deck';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sales — Calls · CareerRai' };

function istHour(): number {
  return new Date(Date.now() + 5.5 * 3600_000).getUTCHours();
}

export default async function SalesCallsPage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');
  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role, email').eq('id', user.id).single();
  if (me?.role !== 'sales' && me?.role !== 'admin') redirect('/login');

  // A rep sees unclaimed leads + her own book; an admin visiting the rep
  // workspace sees everything (oversight, same as /admin/sales).
  const repEmail = me?.role === 'sales' ? ((me?.email as string | null) ?? null) : undefined;
  const { queue, connectedToday, dueNow } = await buildCallQueue(admin, repEmail);
  const primeTime = istHour() >= 18 && istHour() < 21;

  return (
    <div>
      <div className="rounded-2xl border border-teal-700 bg-teal-700 p-5 text-white">
        <p className="text-[11px] font-bold uppercase tracking-widest text-teal-200">Your calls</p>
        {/* Framing is momentum, not a ceiling — never anchor a target number. */}
        <h1 className="mt-1 text-2xl font-bold">{connectedToday > 0 ? `${connectedToday} connected today — keep going` : 'Let’s get some conversions'}</h1>
        <p className="mt-1 text-sm text-teal-100">
          {dueNow > 0 ? `${dueNow} callbacks/retries due now · ` : ''}{queue.length} in your queue, highest priority first. Read the brief, call, log the outcome.
        </p>
        <div className={cn('mt-3 rounded-xl px-3 py-2 text-[13px] font-semibold', primeTime ? 'bg-emerald-400/20 text-emerald-100' : 'bg-white/10 text-teal-100')}>
          {primeTime ? '🟢 Prime calling hours (6–9 PM) — best pickup. Push hard now.' : '⏰ Best pickup is 6–9 PM. Work the due callbacks and top leads first.'}
        </div>
      </div>

      <div className="mt-4">
        {queue.length === 0 ? (
          <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center text-sm text-stone-500">
            No one to call right now. Callbacks and fresh leads roll in through the day — check back this evening.
          </div>
        ) : (
          <CallDeck queue={queue} />
        )}
      </div>
    </div>
  );
}
