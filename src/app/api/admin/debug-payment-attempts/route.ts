import { NextResponse } from 'next/server';
import { isRequestAdmin } from '@/lib/require-admin';
import { fetchOrderPayments } from '@/lib/razorpay';

// TEMPORARY diagnostic route — 20 Aug 2026 payment-pending investigation.
// Read-only: asks Razorpay what actually happened on 7 specific orders whose
// checkout opened and closed in under 30s with no completion. Delete once the
// root cause is confirmed; not meant to stay in the codebase.
const ORDERS: { label: string; orderId: string }[] = [
  { label: 'Anmol agrawal', orderId: 'order_TQocf7N25qcFEJ' },
  { label: 'harshit singh', orderId: 'order_TOjtw2djmKPIxR' },
  { label: 'samman Kumar pathak', orderId: 'order_TOXuAZjcqGUZDF' },
  { label: 'Shreyansh Pandey', orderId: 'order_TOrrrDdZQWf7OP' },
  { label: 'M', orderId: 'order_TQmtokVgezlZty' },
  { label: 'Sumit', orderId: 'order_TQrot2yFQo3NjV' },
  { label: 'Nishant', orderId: 'order_TRfgZshHVgnPKZ' },
];

export async function GET() {
  if (!(await isRequestAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const results = await Promise.all(
    ORDERS.map(async ({ label, orderId }) => {
      try {
        const payments = await fetchOrderPayments(orderId);
        return { label, orderId, payments };
      } catch (err) {
        return { label, orderId, error: err instanceof Error ? err.message : String(err) };
      }
    }),
  );

  return NextResponse.json({ results });
}
