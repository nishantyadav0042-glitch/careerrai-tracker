import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { AdminCouponsClient, type CouponRow } from './admin-coupons-client';

interface CouponRecord {
  id: string;
  code: string;
  discount_type: 'percent' | 'flat';
  discount_value: number;
  expires_at: string | null;
  max_uses: number | null;
  used_count: number;
  status: 'active' | 'paused' | 'expired';
  created_at: string | null;
}

function discountLabel(type: 'percent' | 'flat', value: number): string {
  if (type === 'percent') return `${value}% off`;
  return `₹${(value / 100).toLocaleString('en-IN')} off`;
}

export default async function AdminCouponsPage() {
  // Local JWT verification — middleware already paid the network auth hop.
  const { admin } = await requireAdmin();

  const { data: coupons } = await admin
    .from('coupons')
    .select('id, code, discount_type, discount_value, expires_at, max_uses, used_count, status, created_at')
    .order('created_at', { ascending: false });

  const rows: CouponRow[] = ((coupons as CouponRecord[] | null) ?? []).map((c) => ({
    id: c.id,
    code: c.code,
    status: c.status,
    discountLabel: discountLabel(c.discount_type, c.discount_value),
    usageLabel: `${c.used_count} / ${c.max_uses ?? '∞'}`,
    expiresAt: c.expires_at,
  }));

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-3xl mx-auto px-4 py-6 pb-20">
        <div className="mb-5">
          <h1 className="text-xl font-bold text-stone-900 tracking-tight" style={{ fontFamily: 'Georgia, serif' }}>Money</h1>
          <div className="mt-2 flex gap-1.5">
            <Link href="/admin/payments" className="rounded-full bg-white border border-stone-200 px-3 py-1 text-xs font-semibold text-stone-600 hover:border-stone-400">Payments</Link>
            <span className="rounded-full bg-stone-900 px-3 py-1 text-xs font-semibold text-white">Coupons</span>
            <Link href="/admin/scholarships" className="rounded-full bg-white border border-stone-200 px-3 py-1 text-xs font-semibold text-stone-600 hover:border-stone-400">Scholarships</Link>
          </div>
        </div>

        <AdminCouponsClient coupons={rows} />
      </div>
    </div>
  );
}
