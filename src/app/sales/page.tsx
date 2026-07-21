import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { cn } from '@/lib/utils';
import { buildSalesQueue, getCallbacksDue, type LeadRow } from '@/lib/sales-queue';
import { SalesWorkspace } from '@/components/sales-workspace';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sales — Today · CareerRai' };

function istHour(): number {
  return parseInt(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }), 10) % 24;
}
function istTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
}

export default async function SalesTodayPage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');
  const admin = createAdminClient();

  const [{ opportunities, target, doneToday }, callbacks] = await Promise.all([
    buildSalesQueue(admin),
    getCallbacksDue(admin),
  ]);
  const top: LeadRow[] = opportunities.slice(0, target).map((o) => ({
    studentId: o.studentId, name: o.name, firstName: o.firstName, phone: o.phone, waNumber: o.waNumber,
    convScore: o.convScore, tier: o.tier, status: o.status, callbackAt: null,
    lastActivity: o.lastActivity, why: o.why, script: o.script,
  }));
  const hot = opportunities.filter((o) => o.tier === 'hot').length;
  const primeTime = istHour() >= 18 && istHour() < 21;

  // Callbacks rendered through the same card component.
  const callbackCards: LeadRow[] = callbacks.map((c) => ({
    studentId: c.studentId, name: c.name, firstName: c.name.split(' ')[0], phone: c.phone, waNumber: c.waNumber,
    convScore: 0, tier: 'hot', status: c.status, callbackAt: c.callbackAt, lastActivity: `callback ${istTime(c.callbackAt)}${c.overdue ? ' (overdue)' : ''}`,
    why: c.note ? [`you noted: ${c.note}`] : ['scheduled callback'],
    script: `Hi ${c.name.split(' ')[0]}, Nishant/CareerRai here — aapne kaha tha aaj baat karenge. 2 min hai? Main aapki CAT prep aur buddy option discuss karna chahta tha.`,
  }));

  return (
    <div>
      <div className="rounded-2xl border border-teal-700 bg-teal-700 p-5 text-white">
        <p className="text-[11px] font-bold uppercase tracking-widest text-teal-200">Your calling list — today</p>
        <h1 className="mt-1 text-2xl font-bold">{hot} hot · {top.length} to call</h1>
        <p className="mt-1 text-sm text-teal-100">{doneToday}/{target} conversations done today · ready scripts · log every call.</p>
        <div className={cn('mt-3 rounded-xl px-3 py-2 text-[13px] font-semibold', primeTime ? 'bg-emerald-400/20 text-emerald-100' : 'bg-white/10 text-teal-100')}>
          {primeTime ? '🟢 Prime time (6–9 PM) — highest pickup. Start now.' : '⏰ Best calling window is 6–9 PM. Work top-down.'}
        </div>
      </div>

      {callbackCards.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-widest text-rose-500">Call back now · {callbackCards.length}</p>
          <SalesWorkspace cards={callbackCards} removeOnSave />
        </div>
      )}

      <div className="mt-4">
        <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-widest text-stone-400">Today&apos;s opportunities · hottest first</p>
        <SalesWorkspace cards={top} removeOnSave />
      </div>
    </div>
  );
}
