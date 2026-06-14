import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ArrowLeft } from 'lucide-react';
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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') redirect('/login');

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
        <div className="flex items-center gap-3 mb-6">
          <Link href="/admin" className="p-2 hover:bg-stone-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-stone-600" />
          </Link>
          <div>
            <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold">Admin</p>
            <h1 className="text-2xl font-bold text-stone-900 tracking-tight" style={{ fontFamily: 'Georgia, serif' }}>
              Coupons
            </h1>
          </div>
        </div>

        <AdminCouponsClient coupons={rows} />
      </div>
    </div>
  );
}
