import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { resolveEntity } from '@/lib/os/resolve-entity';
import { getEntityTimeline } from '@/lib/os/timeline';
import { EntityNeighbours } from '@/components/admin/entity-neighbours';
import { ArrowLeft, ShieldAlert, CheckCircle2 } from 'lucide-react';

export const dynamic = 'force-dynamic';

// PAYMENT 360 — one payment, and everything it touches.
//
// Co-founder rule: "open a payment — student, subscription, coupon, refund,
// timeline." Reuses EntityNeighbours over the payment's graph (student, coupon)
// and adds the one check that matters most: did this money actually unlock what
// it paid for? A `paid` row on a still-free student is the sacred failure, and
// this page shows it in red with the fix, right where a founder lands after
// tapping the payment in an alert.

const STATUS_TONE: Record<string, string> = {
  paid: 'bg-emerald-100 text-emerald-700',
  created: 'bg-amber-100 text-amber-800',
  failed: 'bg-red-100 text-red-700',
  refunded: 'bg-stone-100 text-stone-600',
};

export default async function Payment360Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { admin } = await requireAdmin();

  const [{ data: pay }, entity, timeline] = await Promise.all([
    admin.from('student_payments')
      .select('id, student_id, amount, plan, status, razorpay_order_id, razorpay_payment_id, coupon_code, created_at, paid_at')
      .eq('id', id).maybeSingle(),
    resolveEntity(admin, 'payment', id),
    getEntityTimeline(admin, 'payment', id, 20),
  ]);

  if (!pay) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center text-sm text-stone-500">
        Payment not found. <Link href="/admin/payments" className="underline">Back to payments</Link>
      </div>
    );
  }

  // The sacred check: money captured, is the student actually premium?
  const { data: student } = await admin
    .from('profiles').select('full_name, phone, is_premium, subscription_status')
    .eq('id', pay.student_id).maybeSingle();

  const capturedNotActivated = pay.status === 'paid' && student && student.is_premium !== true;
  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—';

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24">
      <Link href="/admin/payments" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-stone-800">
        <ArrowLeft className="h-3.5 w-3.5" /> Payments
      </Link>

      {capturedNotActivated && (
        <div className="mb-3 rounded-2xl border-2 border-red-400 bg-red-50 p-3.5">
          <p className="flex items-center gap-1.5 text-[14px] font-bold text-red-800">
            <ShieldAlert className="h-4 w-4" /> Captured but never unlocked
          </p>
          <p className="mt-1 text-[12px] text-red-700">
            ₹{(pay.amount ?? 0) / 100} was paid, but {student?.full_name ?? 'this student'} is still{' '}
            {student?.subscription_status ?? 'not premium'}. Retry the unlock, and call them if it keeps failing.
          </p>
        </div>
      )}

      {/* Header */}
      <div className="rounded-2xl border border-stone-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-stone-900">₹{(pay.amount ?? 0) / 100}</h1>
            <p className="mt-0.5 text-xs text-stone-500">{pay.plan as string} · order {(pay.razorpay_order_id as string) ?? '—'}</p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_TONE[pay.status as string] ?? 'bg-stone-100 text-stone-600'}`}>
            {pay.status as string}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
          <Field label="Created" value={fmt(pay.created_at as string)} />
          <Field label="Paid" value={fmt(pay.paid_at as string | null)} />
          <Field label="Payment id" value={(pay.razorpay_payment_id as string) ?? 'none'} />
          <Field label="Coupon" value={(pay.coupon_code as string) ?? 'none'} />
        </div>

        {!capturedNotActivated && pay.status === 'paid' && (
          <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-[12px] font-semibold text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> Premium is active for this student.
          </p>
        )}
      </div>

      {entity && <EntityNeighbours entity={entity} />}

      <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-4">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-stone-400">Timeline</p>
        {timeline.length === 0 ? (
          <p className="text-[12px] text-stone-400">No recorded decisions on this payment yet.</p>
        ) : (
          <div className="space-y-1.5">
            {timeline.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-[12.5px]">
                <span className="text-stone-700">{t.summary}</span>
                <span className="text-[11px] text-stone-400">{fmt(t.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">{label}</p>
      <p className="truncate text-stone-800">{value}</p>
    </div>
  );
}
