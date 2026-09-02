import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { AdminScholarshipsClient, type StudentOption, type ScholarshipRow } from './admin-scholarships-client';

import { fetchAll } from '@/lib/supabase/fetch-all';
interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string | null;
  subscription_status: string | null;
}

interface RawScholarship {
  id: string;
  student_id: string;
  discount_percent: number | null;
  final_price_paise: number | null;
  reason: string | null;
  status: string;
  granted_at: string | null;
  expires_at: string | null;
}

function discountLabel(s: RawScholarship): string {
  if (s.discount_percent != null) return `${s.discount_percent}% off`;
  if (s.final_price_paise != null) {
    return `₹${(s.final_price_paise / 100).toLocaleString('en-IN')} fixed`;
  }
  return '—';
}

export default async function AdminScholarshipsPage() {
  // Local JWT verification — middleware already paid the network auth hop.
  const { admin } = await requireAdmin();

  // Scholarships live behind RLS with no policies — only the service-role
  // admin client can read them.
  const { data: profiles } = await fetchAll(() => admin
    .from('profiles')
    .select('id, full_name, email, subscription_status')
    .eq('role', 'student'));
  const studentRows = (profiles ?? []) as ProfileRow[];

  const { data: scholarshipData } = await admin
    .from('scholarships')
    .select('id, student_id, discount_percent, final_price_paise, reason, status, granted_at, expires_at')
    .order('granted_at', { ascending: false });
  const rawScholarships = (scholarshipData ?? []) as RawScholarship[];

  const byId = new Map(studentRows.map((p) => [p.id, p]));

  const students: StudentOption[] = studentRows
    .map((p) => ({
      id: p.id,
      fullName: p.full_name ?? 'Unnamed student',
      email: p.email ?? '',
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  const scholarships: ScholarshipRow[] = rawScholarships.map((s) => {
    const student = byId.get(s.student_id);
    return {
      id: s.id,
      studentName: student?.full_name ?? 'Unknown student',
      studentEmail: student?.email ?? '',
      discountLabel: discountLabel(s),
      reason: s.reason,
      status: (s.status === 'revoked' || s.status === 'expired' ? s.status : 'active'),
      grantedAt: s.granted_at,
      expiresAt: s.expires_at,
    };
  });

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-3xl mx-auto px-4 py-6 pb-20">
        <div className="mb-5">
          <h1 className="text-xl font-bold text-stone-900 tracking-tight" style={{ fontFamily: 'Georgia, serif' }}>Money</h1>
          <div className="mt-2 flex gap-1.5">
            <Link href="/admin/payments" className="rounded-full bg-white border border-stone-200 px-3 py-1 text-xs font-semibold text-stone-600 hover:border-stone-400">Payments</Link>
            <Link href="/admin/coupons" className="rounded-full bg-white border border-stone-200 px-3 py-1 text-xs font-semibold text-stone-600 hover:border-stone-400">Coupons</Link>
            <span className="rounded-full bg-stone-900 px-3 py-1 text-xs font-semibold text-white">Scholarships</span>
          </div>
        </div>

        <AdminScholarshipsClient students={students} scholarships={scholarships} />
      </div>
    </div>
  );
}
