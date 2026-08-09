import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { WorkspaceShell, AdminEmpty } from '@/components/admin/workspace-shell';
import { assembleRevenueOps, REVENUE_META, type RevenueState } from '@/lib/os/revenue-ops';
import { ShieldAlert, Phone } from 'lucide-react';

export const dynamic = 'force-dynamic';

// REVENUE OPERATIONS — money requiring attention, nothing else.
//
// The same law as People, applied to money: healthy payments disappear. The
// default is the exceptions — captured-not-unlocked, failed, abandoned, refund
// requested — priority-sorted, each opening the payment/student 360. A filter
// chip narrows to one state. There is no "all payments" table to scroll.
const TONE: Record<string, string> = {
  red: 'bg-red-100 text-red-700', amber: 'bg-amber-100 text-amber-800', stone: 'bg-stone-100 text-stone-600',
};
const STATES: RevenueState[] = ['captured_not_unlocked', 'refund_requested', 'payment_failed', 'abandoned'];

export default async function RevenueOpsPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { admin } = await requireAdmin();
  const { state } = await searchParams;
  const ops = await assembleRevenueOps(admin, Date.now());

  const active = STATES.find((s) => s === state) ?? null;
  const rows = active ? ops.items.filter((i) => i.state === active) : ops.items;
  const countOf = (s: RevenueState) => ops.items.filter((i) => i.state === s).length;

  return (
    <WorkspaceShell
      workspaceId="finance"
      activeHref="/admin/revenue"
      title="Revenue operations"
      subtitle={ops.items.length === 0 ? 'No money needs attention — all clear' : `${ops.items.length} money item${ops.items.length === 1 ? '' : 's'} need you${ops.atRiskRupees > 0 ? ` · ₹${ops.atRiskRupees} at risk` : ''}`}
    >
      {ops.items.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          <Link href="/admin/revenue" className={!active ? 'rounded-lg bg-stone-900 px-2.5 py-1 text-[11.5px] font-semibold text-white' : 'rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-[11.5px] font-semibold text-stone-600'}>
            All <span className="opacity-60">{ops.items.length}</span>
          </Link>
          {STATES.map((s) => {
            const n = countOf(s);
            return (
              <Link key={s} href={`/admin/revenue?state=${s}`} className={active === s ? 'rounded-lg bg-stone-900 px-2.5 py-1 text-[11.5px] font-semibold text-white' : `rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-[11.5px] font-semibold text-stone-600 ${n === 0 ? 'opacity-40' : ''}`}>
                {REVENUE_META[s].label} <span className="opacity-60">{n}</span>
              </Link>
            );
          })}
        </div>
      )}

      {rows.length === 0 ? (
        <AdminEmpty>Nothing to do here — money is healthy. Go build.</AdminEmpty>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const m = REVENUE_META[r.state];
            return (
              <div key={r.id} className={`rounded-2xl border p-3.5 ${r.state === 'captured_not_unlocked' ? 'border-red-300 bg-red-50' : 'border-stone-200 bg-white'}`}>
                <div className="flex items-start gap-2.5">
                  {r.state === 'captured_not_unlocked' && <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[14px] font-bold text-stone-900">{r.studentName}</p>
                      {r.amountRupees != null && <span className="shrink-0 text-[13px] font-bold text-stone-700">₹{r.amountRupees}</span>}
                    </div>
                    <p className="mt-0.5 text-[11.5px] leading-snug text-stone-500">{r.detail}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${TONE[m.tone]}`}>{m.label}</span>
                </div>
                <div className="mt-2.5 flex items-center gap-2 pl-6.5">
                  <Link href={r.route} className="inline-flex items-center gap-1 rounded-lg bg-stone-900 px-3 py-1.5 text-[12px] font-bold text-white">
                    Open →
                  </Link>
                  {r.phone && (
                    <a href={`https://wa.me/${r.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] font-semibold text-teal-700">
                      <Phone className="h-3 w-3" /> Call
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </WorkspaceShell>
  );
}
