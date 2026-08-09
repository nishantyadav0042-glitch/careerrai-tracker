/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = any;

// ── Every paid student is sacred ────────────────────────────────────────────
//
// Co-founder rule, 9 Aug: "If a paying student hits a bug — especially during
// payment, premium activation, plan generation, buddy assignment — the system
// must treat it as a P0 incident. I never want to discover a premium user's
// problem from a WhatsApp. Detect it, attempt automatic recovery, and if it
// still isn't resolved, escalate to me with the student, the root cause, and a
// one-click fix."
//
// This is the detector. The crown-jewel case is proven to exist in the live
// data: a payment marked `paid` while the student is still `free_beta` — money
// captured, premium never granted. On 9 Aug one such row had sat undiscovered
// for TWENTY-FIVE DAYS. It was the benign Razorpay test account, but the state
// is real and nothing was watching it.
//
// SELF-HEALING FIRST. The founder's rule is "never notify me about something
// the system can fix itself; escalate only when automatic recovery has
// failed." reconcile-payments already runs every 15 minutes and re-attempts
// activation. So this does NOT alert on a fresh stuck payment — it alerts only
// once the self-heal window has passed, which means reconcile has had at least
// one attempt and the student is STILL not activated. The alert therefore
// means "automatic recovery failed", not "first attempt failed", exactly as
// asked.

/** reconcile-payments runs every 15 min; give it one full cycle plus slack. */
export const SELF_HEAL_WINDOW_MIN = 20;

/** How long a paying student may wait for a mentor before it is an incident. */
export const BUDDY_SLA_HOURS = 24;

export type AlertSeverity = 'critical' | 'high';

/** How the founder is reached — the escalation model, as a pure decision. */
export type AlertChannel = 'interrupt' | 'batch';

export interface FounderAlert {
  id: string;
  severity: AlertSeverity;
  /** critical → interrupt now; high → batch every 30 min. */
  channel: AlertChannel;
  /** The headline, written as an instruction. */
  title: string;
  /** The student this is about — money and a face, never an anonymous count. */
  student: { id: string; name: string; phone: string | null };
  amountRupees: number | null;
  /** What actually went wrong, in one line. */
  rootCause: string;
  /** Whether the system can retry, and where the one-click action lives. */
  retryAvailable: boolean;
  actionLabel: string;
  actionRoute: string;
}

/**
 * The escalation channel for a severity.
 *
 * Critical interrupts immediately (money, or a paid student blocked). High is
 * batched every 30 minutes so a growing queue does not become a pager storm.
 * Medium is not here on purpose — medium lives in the daily Founder Inbox, and
 * a thing that can wait for the inbox is not an alert.
 */
export function escalationChannel(severity: AlertSeverity): AlertChannel {
  return severity === 'critical' ? 'interrupt' : 'batch';
}

/**
 * Find every sacred-student failure the system could not fix itself.
 *
 * Only states where self-heal has already had its chance and lost. Each result
 * carries the student, the money, the root cause and a one-click action — the
 * founder never gets "payment failed", only "here is who, here is why, here is
 * the button."
 */
export async function findSacredFailures(admin: Admin, nowMs: number): Promise<FounderAlert[]> {
  const alerts: FounderAlert[] = [];

  // ── 1. Money captured, premium never granted (self-heal has run and failed) ─
  const healDeadline = new Date(nowMs - SELF_HEAL_WINDOW_MIN * 60_000).toISOString();
  const { data: paidRows } = await admin
    .from('student_payments')
    .select('id, student_id, amount, paid_at, razorpay_payment_id')
    .eq('status', 'paid')
    .not('paid_at', 'is', null)
    .lt('paid_at', healDeadline);

  const paidStudentIds = [...new Set((paidRows ?? []).map((r: any) => r.student_id))] as string[];
  const { data: paidProfiles } = paidStudentIds.length
    ? await admin.from('profiles')
        .select('id, full_name, phone, is_premium')
        .in('id', paidStudentIds)
        // Exclude test/demo accounts — the Razorpay Review account is a `paid`
        // row that will never be premium by design, and it was firing as a
        // fake P0 at the very top of the Command Center.
        .not('is_test_account', 'is', true).not('is_demo', 'is', true)
    : { data: [] as any[] };
  const profileById = new Map((paidProfiles ?? []).map((p: any) => [p.id, p]));

  for (const pay of paidRows ?? []) {
    const prof: any = profileById.get(pay.student_id);
    if (!prof || prof.is_premium === true) continue; // activated — nothing wrong
    alerts.push({
      id: `unlock:${pay.id}`,
      severity: 'critical',
      channel: 'interrupt',
      title: `₹${(pay.amount ?? 0) / 100} captured but premium never unlocked for ${prof.full_name ?? 'a student'}`,
      student: { id: prof.id, name: prof.full_name ?? 'Student', phone: prof.phone ?? null },
      amountRupees: (pay.amount ?? 0) / 100,
      rootCause: pay.razorpay_payment_id
        ? 'Razorpay confirmed the payment, but activation did not complete — webhook or activation failure. Automatic reconcile has already retried and not fixed it.'
        : 'Marked paid with no Razorpay payment id — a manual or malformed record. Verify before granting access.',
      retryAvailable: true,
      actionLabel: 'Open payment',
      actionRoute: `/admin/payment/${pay.id}`,
    });
  }

  // ── 2. Paying student with no mentor past SLA ───────────────────────────────
  const { data: premiumNoBuddy } = await admin
    .from('profiles')
    .select('id, full_name, phone, premium_since')
    .eq('role', 'student').eq('is_premium', true).is('buddy_id', null)
    .not('is_test_account', 'is', true);

  const slaDeadline = nowMs - BUDDY_SLA_HOURS * 3_600_000;
  for (const s of premiumNoBuddy ?? []) {
    const since = s.premium_since ? Date.parse(s.premium_since) : null;
    const overdue = since == null || since < slaDeadline;
    alerts.push({
      id: `buddy:${s.id}`,
      severity: overdue ? 'critical' : 'high',
      channel: escalationChannel(overdue ? 'critical' : 'high'),
      title: `${s.full_name ?? 'A paying student'} has been premium ${overdue ? `over ${BUDDY_SLA_HOURS}h` : 'and'} with no mentor`,
      student: { id: s.id, name: s.full_name ?? 'Student', phone: s.phone ?? null },
      amountRupees: null,
      rootCause: overdue
        ? `Paid, and past the ${BUDDY_SLA_HOURS}-hour assignment SLA with no buddy. The one thing they paid for, undelivered.`
        : 'Paid recently and not yet assigned a mentor — assign before the SLA lapses.',
      retryAvailable: false,
      actionLabel: 'Open student',
      actionRoute: `/admin/student/${s.id}`,
    });
  }

  // Critical first, then by money at stake.
  return alerts.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
    return (b.amountRupees ?? 0) - (a.amountRupees ?? 0);
  });
}
