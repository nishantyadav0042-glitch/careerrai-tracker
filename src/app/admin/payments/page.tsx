import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { PLANS, isPlanId } from '@/lib/plans';
import { AdminPaymentsClient, type IncomingRow, type OutgoingRow, type RefundRow } from './admin-payments-client';

function currentPeriod() {
  // 'YYYY-MM' in IST
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 7);
}

export default async function AdminPaymentsPage() {
  // Local JWT verification — middleware already paid the network auth hop.
  const { admin } = await requireAdmin();

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, role, full_name, buddy_id, subscription_status, subscription_plan, subscription_renews_at, agreed_monthly_payout');
  const all = profiles ?? [];
  const students = all.filter((p) => p.role === 'student');
  const buddies = all.filter((p) => p.role === 'buddy');

  // Last successful payment per student
  const { data: paidRows } = await admin
    .from('student_payments')
    .select('student_id, amount, paid_at')
    .eq('status', 'paid')
    .order('paid_at', { ascending: false });
  const lastPaid = new Map<string, { amount: number; paid_at: string | null }>();
  for (const r of paidRows ?? []) {
    if (!lastPaid.has(r.student_id)) lastPaid.set(r.student_id, { amount: r.amount, paid_at: r.paid_at });
  }

  const incoming: IncomingRow[] = students.map((s) => {
    const lp = lastPaid.get(s.id);
    return {
      id: s.id,
      name: s.full_name,
      status: (s.subscription_status as IncomingRow['status']) ?? 'free',
      plan: (s.subscription_plan as string | null) ?? null,
      renewsAt: (s.subscription_renews_at as string | null) ?? null,
      lastPaidAt: lp?.paid_at ?? null,
      lastAmountPaise: lp?.amount ?? null,
    };
  });

  // Summary
  const activeSubs = incoming.filter((r) => r.status === 'active').length;
  const mrr = incoming.reduce((sum, r) => {
    if (r.status !== 'active' || !r.plan || !isPlanId(r.plan)) return sum;
    const p = PLANS[r.plan];
    return sum + p.amountPaise / 100 / p.months;
  }, 0);
   
  const weekFromNow = Date.now() + 7 * 24 * 3600 * 1000;
  const expiringThisWeek = incoming.filter(
    (r) => r.status === 'active' && r.renewsAt && new Date(r.renewsAt).getTime() <= weekFromNow
  ).length;

  // Outgoing (buddy payouts)
  const period = currentPeriod();
  const { data: payoutRows } = await admin
    .from('buddy_payouts')
    .select('buddy_id, status, paid_date, payment_ref, agreed_amount')
    .eq('period', period);
  const payoutByBuddy = new Map((payoutRows ?? []).map((r) => [r.buddy_id, r]));

  const outgoing: OutgoingRow[] = buddies.map((b) => {
    const activeStudents = students.filter((s) => s.buddy_id === b.id).length;
    const po = payoutByBuddy.get(b.id);
    return {
      buddyId: b.id,
      name: b.full_name,
      activeStudents,
      agreedPayout: (b.agreed_monthly_payout as number | null) ?? null,
      period,
      status: (po?.status as 'pending' | 'paid') ?? 'pending',
      paidDate: po?.paid_date ?? null,
      paymentRef: po?.payment_ref ?? null,
    };
  });

  // Refund requests
  const { data: refundRows } = await admin
    .from('refund_requests')
    .select('student_id, requested_at, days_logged, status, admin_notes')
    .order('requested_at', { ascending: false });

  const studentMap = new Map(all.map((p) => [p.id, p.full_name as string | null]));
  const refunds: RefundRow[] = (refundRows ?? []).map((r) => ({
    studentId: r.student_id,
    studentName: studentMap.get(r.student_id) ?? 'Unknown',
    requestedAt: r.requested_at,
    daysLogged: r.days_logged,
    status: r.status as RefundRow['status'],
    adminNotes: r.admin_notes ?? null,
  }));

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-3xl mx-auto px-4 py-6 pb-20">
        <div className="mb-5">
          <h1 className="text-xl font-bold text-stone-900 tracking-tight" style={{ fontFamily: 'Georgia, serif' }}>Money</h1>
          <div className="mt-2 flex gap-1.5">
            <span className="rounded-full bg-stone-900 px-3 py-1 text-xs font-semibold text-white">Payments</span>
            <Link href="/admin/coupons" className="rounded-full bg-white border border-stone-200 px-3 py-1 text-xs font-semibold text-stone-600 hover:border-stone-400">Coupons</Link>
            <Link href="/admin/scholarships" className="rounded-full bg-white border border-stone-200 px-3 py-1 text-xs font-semibold text-stone-600 hover:border-stone-400">Scholarships</Link>
          </div>
        </div>

        <AdminPaymentsClient
          incoming={incoming}
          outgoing={outgoing}
          refunds={refunds}
          summary={{ activeSubs, mrr: Math.round(mrr), expiringThisWeek }}
          period={period}
        />
      </div>
    </div>
  );
}
