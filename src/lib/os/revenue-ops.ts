import { findSacredFailures } from './sacred-guard';
import { checkoutStall, stallDetail, ORDER_ATTRIBUTION_FROM } from '@/lib/checkout-stall';
import { PAYMENT_FUNNEL_EVENTS, funnelOrderId } from '@/lib/payment-funnel';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = any;

// ── Revenue Operations — money requiring attention, nothing else ────────────
//
// Founder, 9 Aug: "Don't build a Payments page. Build Revenue Operations.
// Default: money requiring attention — 4. Everything healthy disappears."
//
// So this is the same law as People, applied to money: a healthy payment is
// invisible. Only the ones that need a human surface — captured-but-not-
// unlocked (the sacred fault), failed, abandoned, refund requested. Each is a
// priority-ranked item with one action, routing to the Payment 360. The same
// filter/priority/action model as People — one engine, a second workflow.

export type RevenueState = 'captured_not_unlocked' | 'payment_failed' | 'abandoned' | 'refund_requested';

export const REVENUE_META: Record<RevenueState, { label: string; tone: 'red' | 'amber' | 'stone'; priority: 0 | 1 | 2 }> = {
  captured_not_unlocked: { label: 'Captured, not unlocked', tone: 'red', priority: 0 },
  refund_requested:      { label: 'Refund requested', tone: 'amber', priority: 1 },
  payment_failed:        { label: 'Payment failed', tone: 'amber', priority: 1 },
  abandoned:             { label: 'Abandoned checkout', tone: 'stone', priority: 2 },
};

export interface RevenueItem {
  id: string;
  state: RevenueState;
  studentId: string | null;
  studentName: string;
  phone: string | null;
  amountRupees: number | null;
  detail: string;
  route: string;
}

export interface RevenueOps {
  items: RevenueItem[];
  /** Money genuinely at risk (captured-not-unlocked + refunds) — the P0 slice. */
  atRiskRupees: number;
}

export async function assembleRevenueOps(admin: Admin, nowMs: number): Promise<RevenueOps> {
  const items: RevenueItem[] = [];

  // 1. Captured but not unlocked — from the sacred guard, so the money-page and
  //    the alert can never disagree about who is broken. Test accounts already
  //    excluded there.
  const sacred = await findSacredFailures(admin, nowMs);
  for (const a of sacred.filter((x) => x.id.startsWith('unlock:'))) {
    items.push({
      id: a.id, state: 'captured_not_unlocked',
      studentId: a.student.id, studentName: a.student.name, phone: a.student.phone,
      amountRupees: a.amountRupees,
      detail: a.rootCause,
      route: a.actionRoute,
    });
  }

  // 2. Failed, abandoned, and refund-requested — real money exceptions.
  const [{ data: failed }, { data: abandoned }, { data: refundReq }] = await Promise.all([
    admin.from('student_payments')
      .select('id, student_id, amount, created_at')
      .eq('status', 'failed')
      .gte('created_at', new Date(nowMs - 30 * 86_400_000).toISOString()),
    admin.from('student_payments')
      .select('id, student_id, amount, created_at, razorpay_order_id')
      .eq('status', 'created')
      .gte('created_at', new Date(nowMs - 14 * 86_400_000).toISOString()),
    admin.from('profiles')
      .select('id, full_name, phone')
      .eq('subscription_status', 'refund_requested')
      .not('is_test_account', 'is', true).not('is_demo', 'is', true),
  ]);

  const studentIds = [
    ...new Set([...(failed ?? []), ...(abandoned ?? [])].map((r: any) => r.student_id)),
  ].filter(Boolean) as string[];
  const { data: profs } = studentIds.length
    ? await admin.from('profiles').select('id, full_name, phone, is_test_account, is_demo').in('id', studentIds)
    : { data: [] as any[] };
  const profById = new Map((profs ?? []).map((p: any) => [p.id, p]));

  for (const r of failed ?? []) {
    const p: any = profById.get(r.student_id);
    if (!p || p.is_test_account || p.is_demo) continue;
    items.push({
      id: `failed:${r.id}`, state: 'payment_failed',
      studentId: r.student_id, studentName: p.full_name ?? 'Student', phone: p.phone ?? null,
      amountRupees: (r.amount ?? 0) / 100,
      detail: 'A card or bank declined. Reach out — they tried to pay.',
      route: `/admin/student/${r.student_id}`,
    });
  }
  // Where each abandoned order actually stopped. This card used to assert
  // "Opened checkout and left" for every one of them — including the orders
  // that never showed a payment window at all, which is our defect and not a
  // sales follow-up. The funnel events have been able to tell these apart
  // since August; nothing read them here until now. See lib/checkout-stall.
  const orderIds = (abandoned ?? []).map((r: any) => r.razorpay_order_id).filter(Boolean) as string[];
  const eventsByOrder = new Map<string, { event: string }[]>();
  if (orderIds.length) {
    const { data: funnelRows } = await admin
      .from('analytics_events')
      .select('event_type, metadata')
      .in('event_type', PAYMENT_FUNNEL_EVENTS as unknown as string[])
      .gte('created_at', new Date(nowMs - 21 * 86_400_000).toISOString());
    for (const e of (funnelRows ?? []) as any[]) {
      // Through funnelOrderId, never a literal: this line read `orderId` while
      // the route wrote `order_id`, so it matched 0 of 87 production rows.
      const oid = funnelOrderId(e.metadata);
      if (oid == null || !orderIds.includes(oid)) continue;
      eventsByOrder.set(oid, [...(eventsByOrder.get(oid) ?? []), { event: e.event_type as string }]);
    }
  }

  for (const r of abandoned ?? []) {
    const p: any = profById.get(r.student_id);
    if (!p || p.is_test_account || p.is_demo) continue;
    const stall = checkoutStall(
      r.created_at as string,
      eventsByOrder.get(r.razorpay_order_id as string) ?? [],
      ORDER_ATTRIBUTION_FROM,
    );
    items.push({
      id: `abandoned:${r.id}`, state: 'abandoned',
      studentId: r.student_id, studentName: p.full_name ?? 'Student', phone: p.phone ?? null,
      amountRupees: (r.amount ?? 0) / 100,
      detail: stallDetail(stall),
      route: `/admin/student/${r.student_id}`,
    });
  }
  for (const s of refundReq ?? []) {
    items.push({
      id: `refund:${s.id}`, state: 'refund_requested',
      studentId: s.id, studentName: s.full_name ?? 'Student', phone: s.phone ?? null,
      amountRupees: null,
      detail: 'Requested a refund — decide and process.',
      route: `/admin/student/${s.id}`,
    });
  }

  // Priority sort: the state's own priority, then money at stake.
  items.sort((a, b) =>
    REVENUE_META[a.state].priority - REVENUE_META[b.state].priority ||
    (b.amountRupees ?? 0) - (a.amountRupees ?? 0));

  const atRiskRupees = Math.round(
    items.filter((i) => i.state === 'captured_not_unlocked')
      .reduce((s, i) => s + (i.amountRupees ?? 0), 0),
  );

  return { items, atRiskRupees };
}
