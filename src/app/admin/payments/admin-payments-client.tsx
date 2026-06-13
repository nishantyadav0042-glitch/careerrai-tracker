'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PLANS, isPlanId } from '@/lib/plans';

export interface IncomingRow {
  id: string;
  name: string;
  status: 'free_beta' | 'active' | 'expired' | 'refund_requested';
  plan: string | null;
  renewsAt: string | null;
  lastPaidAt: string | null;
  lastAmountPaise: number | null;
}

export interface OutgoingRow {
  buddyId: string;
  name: string;
  activeStudents: number;
  agreedPayout: number | null;
  period: string;
  status: 'pending' | 'paid';
  paidDate: string | null;
  paymentRef: string | null;
}

type IncomingFilter = 'all' | 'active' | 'expired' | 'free_beta' | 'refund_requested';

const STATUS_BADGE: Record<IncomingRow['status'], { label: string; color: 'green' | 'amber' | 'stone' | 'orange' }> = {
  free_beta: { label: 'Free beta', color: 'stone' },
  active: { label: 'Active', color: 'green' },
  expired: { label: 'Expired', color: 'amber' },
  refund_requested: { label: 'Refund req.', color: 'orange' },
};

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

export function AdminPaymentsClient({
  incoming,
  outgoing,
  summary,
  period,
}: {
  incoming: IncomingRow[];
  outgoing: OutgoingRow[];
  summary: { activeSubs: number; mrr: number; expiringThisWeek: number };
  period: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'incoming' | 'outgoing'>('incoming');
  const [filter, setFilter] = useState<IncomingFilter>('all');

  const filtered = incoming.filter((r) => (filter === 'all' ? true : r.status === filter));

  return (
    <div className="space-y-5">
      {/* Tab switch */}
      <div className="flex bg-stone-100 rounded-xl p-1">
        {(['incoming', 'outgoing'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
              tab === t ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600'
            }`}
          >
            {t === 'incoming' ? 'Incoming (students)' : 'Outgoing (buddies)'}
          </button>
        ))}
      </div>

      {tab === 'incoming' ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-4 text-center">
              <div className="text-2xl font-bold font-mono text-emerald-700">{summary.activeSubs}</div>
              <div className="text-[10px] uppercase tracking-wide text-stone-500 font-semibold mt-0.5">Active subs</div>
            </Card>
            <Card className="p-4 text-center">
              <div className="text-2xl font-bold font-mono text-stone-900">₹{summary.mrr.toLocaleString('en-IN')}</div>
              <div className="text-[10px] uppercase tracking-wide text-stone-500 font-semibold mt-0.5">MRR</div>
            </Card>
            <Card className="p-4 text-center">
              <div className="text-2xl font-bold font-mono text-amber-600">{summary.expiringThisWeek}</div>
              <div className="text-[10px] uppercase tracking-wide text-stone-500 font-semibold mt-0.5">Expiring 7d</div>
            </Card>
          </div>

          <div className="flex flex-wrap gap-2">
            {(['all', 'active', 'expired', 'free_beta', 'refund_requested'] as IncomingFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  filter === f ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                {f === 'all' ? 'All' : f === 'free_beta' ? 'Free beta' : f === 'refund_requested' ? 'Refund req.' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <Card className="p-8 text-center text-sm text-stone-500">No students in this view.</Card>
          ) : (
            <div className="space-y-2">
              {filtered.map((r) => (
                <Card key={r.id} className="p-4 flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-stone-900 flex items-center gap-2">
                      {r.name}
                      <Badge color={STATUS_BADGE[r.status].color}>{STATUS_BADGE[r.status].label}</Badge>
                    </div>
                    <div className="text-xs text-stone-500 mt-0.5">
                      {r.plan && isPlanId(r.plan) ? PLANS[r.plan].label : '—'}
                      {r.renewsAt && <> · renews {new Date(r.renewsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-mono text-stone-900">{r.lastAmountPaise != null ? rupees(r.lastAmountPaise) : '—'}</div>
                    <div className="text-[10px] text-stone-400">
                      {r.lastPaidAt ? new Date(r.lastPaidAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'no payment'}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        <OutgoingView rows={outgoing} period={period} onChange={() => router.refresh()} />
      )}
    </div>
  );
}

function OutgoingView({ rows, period, onChange }: { rows: OutgoingRow[]; period: string; onChange: () => void }) {
  const totalOwed = rows.filter((r) => r.status === 'pending').reduce((s, r) => s + (r.agreedPayout ?? 0), 0);
  const totalPaid = rows.filter((r) => r.status === 'paid').reduce((s, r) => s + (r.agreedPayout ?? 0), 0);

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold font-mono text-amber-600">₹{totalOwed.toLocaleString('en-IN')}</div>
          <div className="text-[10px] uppercase tracking-wide text-stone-500 font-semibold mt-0.5">Owed this period</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold font-mono text-emerald-700">₹{totalPaid.toLocaleString('en-IN')}</div>
          <div className="text-[10px] uppercase tracking-wide text-stone-500 font-semibold mt-0.5">Paid this period</div>
        </Card>
      </div>
      <p className="text-xs text-stone-500 px-1">
        Period {period}. Amounts are tracked here — you pay buddies manually via UPI/bank and record it below. No money moves through the app.
      </p>

      {rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-stone-500">No buddies yet.</Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => <OutgoingRowCard key={r.buddyId} row={r} onChange={onChange} />)}
        </div>
      )}
    </>
  );
}

function OutgoingRowCard({ row, onChange }: { row: OutgoingRow; onChange: () => void }) {
  const [amount, setAmount] = useState(row.agreedPayout?.toString() ?? '');
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);

  async function saveAmount() {
    setBusy(true);
    await fetch('/api/admin/payouts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buddy_id: row.buddyId, agreed_monthly_payout: amount === '' ? null : Number(amount) }),
    });
    setBusy(false);
    onChange();
  }

  async function markPaid() {
    setBusy(true);
    const res = await fetch('/api/admin/payouts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buddy_id: row.buddyId, period: row.period, payment_ref: ref }),
    });
    setBusy(false);
    if (res.ok) onChange();
    else { const d = await res.json().catch(() => null); alert(d?.error ?? 'Could not record payout.'); }
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-semibold text-stone-900 flex items-center gap-2">
            {row.name}
            <Badge color={row.status === 'paid' ? 'green' : 'amber'}>{row.status === 'paid' ? 'Marked paid' : 'Pending'}</Badge>
          </div>
          <div className="text-xs text-stone-500 mt-0.5">
            {row.activeStudents} active student{row.activeStudents === 1 ? '' : 's'}
            {row.status === 'paid' && row.paidDate && <> · paid {new Date(row.paidDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</>}
            {row.status === 'paid' && row.paymentRef && <> · ref {row.paymentRef}</>}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-stone-500">₹</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            placeholder="Agreed payout"
            className="w-32 pl-6 pr-2 py-2 bg-white border border-stone-300 rounded-lg text-sm focus:outline-none focus:border-stone-900"
          />
        </div>
        <button onClick={saveAmount} disabled={busy} className="text-xs font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-lg px-3 py-2 disabled:opacity-50">
          Save amount
        </button>

        {row.status === 'pending' && (
          <>
            <input
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="UPI / txn ref"
              className="flex-1 min-w-[120px] px-3 py-2 bg-white border border-stone-300 rounded-lg text-sm focus:outline-none focus:border-stone-900"
            />
            <button
              onClick={markPaid}
              disabled={busy || row.agreedPayout == null}
              className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg px-3 py-2 disabled:opacity-50"
              title={row.agreedPayout == null ? 'Set the agreed payout first' : undefined}
            >
              Mark as paid
            </button>
          </>
        )}
      </div>
    </Card>
  );
}
