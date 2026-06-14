'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export interface CouponRow {
  id: string;
  code: string;
  status: 'active' | 'paused' | 'expired';
  discountLabel: string;
  usageLabel: string;
  expiresAt: string | null;
}

type DiscountType = 'percent' | 'flat';

const STATUS_BADGE: Record<CouponRow['status'], { label: string; color: 'green' | 'stone' | 'amber' }> = {
  active: { label: 'Active', color: 'green' },
  paused: { label: 'Paused', color: 'stone' },
  expired: { label: 'Expired', color: 'amber' },
};

function formatExpiry(iso: string | null): string {
  if (!iso) return 'No expiry';
  return `Expires ${new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

export function AdminCouponsClient({ coupons }: { coupons: CouponRow[] }) {
  return (
    <div className="space-y-5">
      <CreateCouponForm />

      {coupons.length === 0 ? (
        <Card className="p-8 text-center text-sm text-stone-500">No coupons yet.</Card>
      ) : (
        <div className="space-y-2">
          {coupons.map((c) => (
            <CouponCard key={c.id} coupon={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function CreateCouponForm() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [type, setType] = useState<DiscountType>('percent');
  const [value, setValue] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function create() {
    setError(null);
    setSuccess(false);
    if (!code.trim()) {
      setError('Enter a code.');
      return;
    }
    if (value.trim() === '') {
      setError('Enter a value.');
      return;
    }

    setBusy(true);
    const res = await fetch('/api/admin/coupons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: code.trim(),
        discount_type: type,
        value: Number(value),
        expires_at: expiresAt ? expiresAt : null,
        max_uses: maxUses.trim() === '' ? null : Number(maxUses),
      }),
    });
    setBusy(false);

    if (res.ok) {
      setCode('');
      setValue('');
      setExpiresAt('');
      setMaxUses('');
      setType('percent');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
      router.refresh();
    } else {
      const d = await res.json().catch(() => null);
      setError(d?.error ?? 'Could not create coupon.');
    }
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="text-sm font-semibold text-stone-900">Create coupon</div>

      <div className="space-y-3">
        <div>
          <label className="text-xs text-stone-500 font-medium">Code</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="LAUNCH20"
            className="mt-1 w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-sm font-mono focus:outline-none focus:border-stone-900"
          />
        </div>

        <div className="flex bg-stone-100 rounded-xl p-1">
          {(['percent', 'flat'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                type === t ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600'
              }`}
            >
              {t === 'percent' ? 'Percent' : 'Flat ₹'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-stone-500 font-medium">{type === 'percent' ? 'Percent (1–100)' : 'Amount (₹)'}</label>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              placeholder={type === 'percent' ? '20' : '200'}
              className="mt-1 w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-sm focus:outline-none focus:border-stone-900"
            />
          </div>
          <div>
            <label className="text-xs text-stone-500 font-medium">Max uses (optional)</label>
            <input
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              placeholder="∞"
              className="mt-1 w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-sm focus:outline-none focus:border-stone-900"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-stone-500 font-medium">Expiry (optional)</label>
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="mt-1 w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-sm focus:outline-none focus:border-stone-900"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={create}
          disabled={busy}
          className="text-sm font-semibold text-white rounded-lg px-4 py-2 disabled:opacity-50"
          style={{ backgroundColor: '#E8652D' }}
        >
          Create
        </button>
        {error && <span className="text-xs text-rose-600">{error}</span>}
        {success && <span className="text-xs text-emerald-700">✓ Created</span>}
      </div>
    </Card>
  );
}

function CouponCard({ coupon }: { coupon: CouponRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(status: CouponRow['status']) {
    setError(null);
    setBusy(true);
    const res = await fetch('/api/admin/coupons', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: coupon.id, status }),
    });
    setBusy(false);
    if (res.ok) {
      router.refresh();
    } else {
      const d = await res.json().catch(() => null);
      setError(d?.error ?? 'Could not update.');
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-mono font-semibold text-stone-900 flex items-center gap-2">
            {coupon.code}
            <Badge color={STATUS_BADGE[coupon.status].color}>{STATUS_BADGE[coupon.status].label}</Badge>
          </div>
          <div className="text-xs text-stone-500 mt-0.5 flex items-center gap-2">
            <Badge color="blue">{coupon.discountLabel}</Badge>
            <span>used {coupon.usageLabel}</span>
          </div>
          <div className="text-xs text-stone-500 mt-0.5">{formatExpiry(coupon.expiresAt)}</div>
        </div>
      </div>

      {coupon.status !== 'expired' && (
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {coupon.status === 'active' ? (
            <button
              onClick={() => setStatus('paused')}
              disabled={busy}
              className="text-xs font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-lg px-3 py-2 disabled:opacity-50"
            >
              Pause
            </button>
          ) : (
            <button
              onClick={() => setStatus('active')}
              disabled={busy}
              className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg px-3 py-2 disabled:opacity-50"
            >
              Activate
            </button>
          )}
          <button
            onClick={() => setStatus('expired')}
            disabled={busy}
            className="text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg px-3 py-2 disabled:opacity-50"
          >
            Expire
          </button>
          {error && <span className="text-xs text-rose-600">{error}</span>}
        </div>
      )}
    </Card>
  );
}
