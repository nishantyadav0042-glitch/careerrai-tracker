import { SELF_HEAL_WINDOW_MIN as CFG_SELF_HEAL_MIN, BUDDY_SLA_HOURS as CFG_BUDDY_SLA_HOURS } from './scale-config';
import {
  burstsFrom, ACTION_LABEL, ACTION_ROUTE, SACRED_FAILURE_WINDOW_MIN,
} from './sacred-failure';
import { SESSION_PLAN_ID } from '../session-credit';

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
// data: a payment marked `paid` while the student is still `free` — money
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

/** reconcile-payments runs every 15 min; give it one full cycle plus slack.
 *  Sourced from scale-config — business thresholds live in one place. */
export const SELF_HEAL_WINDOW_MIN = CFG_SELF_HEAL_MIN;

/** How long a paying student may wait for a mentor before it is an incident.
 *  Sourced from scale-config — business thresholds live in one place. */
export const BUDDY_SLA_HOURS = CFG_BUDDY_SLA_HOURS;

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
    .select('id, student_id, amount, paid_at, razorpay_payment_id, plan')
    .eq('status', 'paid')
    .not('paid_at', 'is', null)
    .lt('paid_at', healDeadline);

  const paidStudentIds = [...new Set((paidRows ?? []).map((r: any) => r.student_id))] as string[];
  const { data: paidProfiles } = paidStudentIds.length
    ? await admin.from('profiles')
        // `premium_since` is the fact that decides this alert. It is stamped by
        // activation and never cleared, so it answers "was this student EVER
        // granted what they paid for" — which is the actual failure. `is_premium`
        // only answers "are they premium right now", and those are different
        // questions the moment a subscription lapses.
        .select('id, full_name, phone, is_premium, premium_since')
        .in('id', paidStudentIds)
        // Exclude test/demo accounts — the Razorpay Review account is a `paid`
        // row that will never be premium by design, and it was firing as a
        // fake P0 at the very top of the Command Center.
        .not('is_test_account', 'is', true).not('is_demo', 'is', true)
    : { data: [] as any[] };
  const profileById = new Map((paidProfiles ?? []).map((p: any) => [p.id, p]));

  // ── A SESSION PURCHASE IS NOT A SUBSCRIPTION ───────────────────────────
  // A single-session purchase buys ONE session credit, never premium. (No
  // price is stated here on purpose: prices are the pricing authority's to
  // know, and a figure copied into a comment goes stale silently.) Testing it
  // with `is_premium` reports a correctly-served customer as a money fault,
  // forever. So a session payment is judged on the credit it was supposed to
  // mint, not on premium at all.
  const sessionPayIds = (paidRows ?? [])
    .filter((r: any) => r.plan === SESSION_PLAN_ID).map((r: any) => r.id);
  const { data: creditRows } = sessionPayIds.length
    ? await admin.from('session_credits').select('payment_id').in('payment_id', sessionPayIds)
    : { data: [] as any[] };
  const creditedPayIds = new Set((creditRows ?? []).map((c: any) => c.payment_id));

  for (const pay of paidRows ?? []) {
    const prof: any = profileById.get(pay.student_id);
    if (!prof) continue;

    // ── DID THEY GET WHAT THEY PAID FOR? ─────────────────────────────────
    //
    // 5 Sep 2026: this alert was firing on three month-old payments that were
    // all correctly served, and could never clear, because it asked
    // `is_premium !== true` and nothing else. That question is wrong twice:
    //
    //   · Dhruv Vakadia bought a single SESSION. His credit was minted and a
    //     mentor assigned. He was never meant to be premium.
    //   · Harsh Rajput and Vedashri kale each bought a MONTHLY on 4 Aug.
    //     Activation ran (premium_since stamped 4 Aug), they had their month,
    //     and it lapsed on 4 Sep. An expired subscription is a renewal
    //     opportunity, not money captured without delivery.
    //
    // All three carried `premium_since`, which only activation writes — so the
    // alert's own root-cause text ("activation did not complete") was provably
    // false in every case. And because a lapsed subscription never becomes
    // premium again, the alert was permanent: no action could ever clear it,
    // which is how a P0 interrupt becomes background noise the founder learns
    // to scroll past.
    const isSession = pay.plan === SESSION_PLAN_ID;
    const delivered = isSession
      ? creditedPayIds.has(pay.id)          // the credit they bought exists
      : prof.premium_since !== null;        // premium was granted at least once
    if (delivered) continue;
    alerts.push({
      id: `unlock:${pay.id}`,
      severity: 'critical',
      channel: 'interrupt',
      title: isSession
        ? `₹${(pay.amount ?? 0) / 100} captured but the session credit was never created for ${prof.full_name ?? 'a student'}`
        : `₹${(pay.amount ?? 0) / 100} captured but premium never unlocked for ${prof.full_name ?? 'a student'}`,
      student: { id: prof.id, name: prof.full_name ?? 'Student', phone: prof.phone ?? null },
      amountRupees: (pay.amount ?? 0) / 100,
      rootCause: !pay.razorpay_payment_id
        ? 'Marked paid with no Razorpay payment id — a manual or malformed record. Verify before granting access.'
        : isSession
          ? 'Razorpay confirmed the payment, but the session credit was never minted — the student paid for a session they do not have. Automatic reconcile has already retried and not fixed it.'
          : 'Razorpay confirmed the payment, but premium was never granted — activation never ran for this student. Automatic reconcile has already retried and not fixed it.',
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
    // Exclude BOTH test and demo — demo accounts are shared logins, not real
    // paying students, and this count is drilled into via the People list which
    // also excludes both. Aligning the two keeps count == list exactly.
    .not('is_test_account', 'is', true).not('is_demo', 'is', true);

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

  // ── 3. A sacred action is FAILING right now (Incident #30) ────────────────
  //
  // Founder, 12 Aug: "I told you to alert me always if I face any errors."
  // Logging, paying and signing up now record their 500s (sacred-failure.ts),
  // so a broken core action becomes an interrupt instead of a screenshot the
  // founder happens to catch at 11pm. Two failures of the same action inside
  // fifteen minutes is the bar — one can be a dead phone, two is a pattern.
  const failWindow = new Date(nowMs - SACRED_FAILURE_WINDOW_MIN * 60_000).toISOString();
  // Defensive by design: this detector is the thing that REPORTS breakage, so
  // it must never become the breakage. If the failure query itself fails, the
  // money and mentor alerts below it still reach the founder.
  let failRows: { fingerprint: string | null; message: string | null; student_id: string | null; created_at: string }[] = [];
  try {
    const { data } = await admin
      .from('client_errors')
      .select('fingerprint, message, student_id, created_at')
      .eq('source', 'server')
      .gte('created_at', failWindow);
    failRows = data ?? [];
  } catch {
    failRows = [];
  }

  for (const burst of burstsFrom(failRows)) {
    alerts.push({
      // The id carries the window start, so a failure that persists escalates
      // once per burst rather than every fifteen minutes forever.
      id: `sacred-fail:${burst.action}:${burst.firstAt.slice(0, 16)}`,
      severity: 'critical',
      channel: escalationChannel('critical'),
      title: `${burst.count} students could not ${ACTION_LABEL[burst.action]} in the last ${SACRED_FAILURE_WINDOW_MIN} minutes`,
      // A burst is about many students; the drill-down lives at actionRoute.
      student: { id: '', name: `${burst.studentsHit} student${burst.studentsHit === 1 ? '' : 's'} hit`, phone: null },
      amountRupees: null,
      rootCause: `Server error: ${burst.lastMessage}`,
      retryAvailable: false,
      actionLabel: 'Open',
      actionRoute: ACTION_ROUTE[burst.action],
    });
  }

  // Critical first, then by money at stake.
  return alerts.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
    return (b.amountRupees ?? 0) - (a.amountRupees ?? 0);
  });
}
