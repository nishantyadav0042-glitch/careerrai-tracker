import type { Exception } from '@/lib/os/exception';

// ── ONLY MONEY CONVERTS A STUDENT ───────────────────────────────────────────
//
// Incident #52. Found by audit on 29 Aug 2026, before it could fire.
//
// THE BUG. `call-queue.ts` held `CLOSED = {'converted','not_interested','dnd'}`
// and skipped those students with the comment "gone forever". `/api/sales/log`
// accepted `converted` as an ordinary call outcome — it is in CALL_OUTCOMES,
// and nothing checked the payment ledger before writing it.
//
// So a counsellor who tapped "Converted" by mistake, or optimistically after a
// promising call, PERMANENTLY removed that student from every future queue. No
// payment required. No exception raised. The student was simply never called
// again, and the two people whose whole job is retention and conversion would
// never see them.
//
// It was worse in a way that made it hard to notice: /sales/leads filters
// Active as `!paid && status in (…,'converted')`, so the same student still
// appeared under "Active" in the portfolio while being invisible in the queue.
// Two surfaces, opposite answers, and the one the counsellor works from is the
// one that hides them.
//
// It never fired because lead_outreach had zero rows. The day 965 students are
// enrolled it becomes live, which is why this is fixed BEFORE enrolment.
//
// THE RULE, from the founder and from SALES-OS.md §3: the payment ledger is the
// only thing that may produce `converted`. A counsellor saying "converted"
// means strong buying intent — it is a CLAIM about the student, not a fact
// about money, and the two must never be stored as the same thing.
//
// WHAT THIS MODULE REFUSES TO DO. It does not throw the claim away. A rep who
// believes a student has converted is telling us something valuable, and
// discarding it would teach them the form is lying to them. The claim is kept
// as history with `self_reported` provenance; only the STATE is corrected. And
// because a rep who claims a conversion that never arrives is either losing a
// payment or misusing the button, the mismatch becomes an exception the founder
// can act on rather than a silence.

export type ConvertedResolution = {
  /** The state to write to lead_outreach. Never 'converted' without payment. */
  status: 'converted' | 'interested';
  /** True when the rep claimed a conversion the payment ledger does not support. */
  isUnbackedClaim: boolean;
  /** Why, in words the founder reads on the exception. */
  reason: string;
};

/**
 * Resolve a rep's `converted` disposition against the payment ledger.
 *
 * `hasPaidPayment` is passed in rather than read here so this stays pure and
 * the caller's read and the writer's decision come from the same query.
 *
 * NULL is not false. A payment state we could not read is not "they have not
 * paid" — treating an unreadable ledger as unpaid would downgrade a genuine
 * conversion on the strength of a transient database error. Unknown is
 * therefore treated as UNBACKED but flagged distinctly, so the founder sees
 * "we could not verify" rather than "the rep was wrong".
 */
export function resolveConvertedClaim(hasPaidPayment: boolean | null): ConvertedResolution {
  if (hasPaidPayment === true) {
    return { status: 'converted', isUnbackedClaim: false, reason: 'A paid payment exists — this is a real conversion.' };
  }
  if (hasPaidPayment === null) {
    return {
      status: 'interested',
      isUnbackedClaim: true,
      reason: 'The payment ledger could not be read, so the conversion could not be confirmed. The student stays actionable rather than being closed on an unverified claim.',
    };
  }
  return {
    status: 'interested',
    isUnbackedClaim: true,
    reason: 'No paid payment exists. Recorded as strong buying intent; the student stays in the book until money actually arrives.',
  };
}

/**
 * Is this student finished with the sales queue?
 *
 * THE ONLY CLOSING RULES. `not_interested` and `dnd` are the student's own
 * words and close the relationship. Payment closes it because the sale is done.
 * A typed `converted` closes NOTHING on its own — that was the bug.
 *
 * Deliberately takes payment as an explicit argument rather than trusting
 * `status === 'converted'`, so a stale or mistaken status in the table cannot
 * hide a student. If the ledger says paid, they are out; otherwise the only
 * things that remove them are the two the student said.
 */
export function isClosedForSales(
  status: string | null,
  hasPaidPayment: boolean,
): boolean {
  if (hasPaidPayment) return true;
  return status === 'not_interested' || status === 'dnd' || status === 'unqualified';
}

/**
 * The founder exception for a conversion claimed but never paid.
 *
 * Severity is 'high', not 'critical': the student is still in the book and
 * still being worked, so nothing is lost — but it is either a payment that
 * failed on its way through checkout or a button being used wrongly, and both
 * are worth a look within the day.
 */
export function unbackedConversionException(
  args: { studentId: string; studentName: string; repName: string; claimedAtMs: number },
  nowMs: number,
): Exception {
  return {
    id: `converted_unpaid:${args.studentId}:${args.claimedAtMs}`,
    code: 'converted_unpaid',
    domain: 'revenue',
    entity: { kind: 'student', id: args.studentId, label: args.studentName },
    severity: 'high',
    reason: `${args.repName} marked ${args.studentName} converted, but no payment exists. Either a payment failed, or the wrong outcome was tapped.`,
    detectedAtMs: nowMs,
    evidence: {
      claimed_by: args.repName,
      claimed_at: new Date(args.claimedAtMs).toISOString(),
      paid_payment_found: false,
    },
    suggestedAction: { label: 'Open the student and check the payment', route: `/sales/student/${args.studentId}` },
    recovery: { attempted: false, status: 'none' },
    owner: 'founder',
    destination: `/sales/student/${args.studentId}`,
    lifecycle: 'detected',
  };
}
