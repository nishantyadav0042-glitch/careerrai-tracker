// ── The ₹299 session, as a rule set ─────────────────────────────────────────
//
// One paid session with an IIM Buddy, bought by a FREE student, priced at the
// point where a student will risk finding out rather than commit. It is the
// entry product; the Buddy subscription is still the product.
//
// The shape of this module is set by two things the audit found:
//
//  1. Nothing in the app could grant "one session". is_premium is set in a
//     single place that also assigns a permanent buddy, so selling a session
//     used to mean selling the whole membership. session_credits is the
//     entitlement that fixes it — the student stays free, and the Buddy plan
//     stays the thing they upgrade TO.
//
//  2. SUPPLY IS THE BINDING CONSTRAINT, not demand. Four active mentors have
//     delivered 13 sessions in three weeks. Selling twenty on day one would
//     break the promise on exactly the students most willing to pay us, which
//     is the single worst outcome available here. Every function below that
//     could oversell refuses instead.

export const SESSION_PLAN_ID = 'session' as const;
export const SESSION_PRICE_PAISE = 29900;
export const SESSION_MINUTES = 45;

/** The upgrade window. A CREDIT against Till-CAT, never a refund — sessions
 *  are non-refundable by founder ruling, and crediting is a discount. */
export const CREDIT_WINDOW_DAYS = 7;

export type CreditStatus = 'paid' | 'assigned' | 'scheduled' | 'completed' | 'refunded';

/**
 * What the student is told they are buying. Deliberately ONE SKU: the
 * diagnosis decides the reason and the mentor, so engineering stays simple
 * and we never maintain five near-identical products.
 */
export const SESSION_PROMISE = [
  'Review your actual preparation — not general advice',
  'Find the one thing holding your score back',
  'Leave with a written next step',
] as const;

// ── Capacity ────────────────────────────────────────────────────────────────

export interface MentorLoad {
  buddyId: string;
  /** Their own declared ceiling. Null = never declared. */
  weeklyCap: number | null;
  /** Credits already assigned to them and not yet completed, this week. */
  openThisWeek: number;
}

/**
 * How many more sessions this mentor can take this week.
 *
 * An UNDECLARED cap is treated as ZERO, never as unlimited. Seven of our
 * mentors have not declared one yet, and the failure mode of guessing
 * generously is a student who paid and cannot be seen.
 */
export function remainingCapacity(m: MentorLoad): number {
  const cap = m.weeklyCap;
  if (cap == null || !Number.isFinite(cap) || cap <= 0) return 0;
  return Math.max(0, Math.floor(cap) - Math.max(0, m.openThisWeek));
}

/** Total sessions the whole roster can still honour this week. */
export function rosterCapacity(mentors: readonly MentorLoad[]): number {
  return mentors.reduce((sum, m) => sum + remainingCapacity(m), 0);
}

/**
 * May we sell a session right now?
 *
 * "Sold out" is an honest answer and a good one — it says we protect the
 * sessions we have already sold. A silently oversold week does not.
 */
export function canSellSession(mentors: readonly MentorLoad[]): boolean {
  return rosterCapacity(mentors) > 0;
}

// ── Matching ────────────────────────────────────────────────────────────────

/** The mentor speciality vocabulary — the ANSWER side of buddy-case findings. */
export type Speciality =
  | 'mock_analysis' | 'strategy' | 'consistency' | 'second_attempt' | 'section_depth';

export const MAX_SPECIALITIES = 2;

/**
 * Which speciality answers which problem. ONE map, both directions, and both
 * PROVENANCES — the product's own findings (mock_plateau…) and the student's
 * stated intents (varc_weak…) resolve through the same table.
 *
 * Extended 24 Aug with the student-facing intents. 'section_depth' was already
 * declared as a speciality with nothing pointing at it: the answer to a
 * section weakness existed before the question did, which is why this is an
 * extension rather than a second matcher.
 */
export const FINDING_TO_SPECIALITY: Record<string, Speciality> = {
  // Product-observed findings.
  mock_plateau: 'mock_analysis',
  mock_drop: 'mock_analysis',
  no_strategy: 'strategy',
  behind_timeline: 'strategy',
  consistency: 'consistency',
  repeating_pattern: 'second_attempt',
  // Student-stated intents.
  varc_weak: 'section_depth',
  dilr_weak: 'section_depth',
  qa_weak: 'section_depth',
  mock_performance: 'mock_analysis',
  time_management: 'strategy',
  coaching_conflict: 'strategy',
  interview_prep: 'second_attempt',
  other: 'strategy',
  unreviewed: 'strategy',
};

export interface MentorProfile extends MentorLoad {
  fullName: string;
  specialities: Speciality[];
  strongestSection: string | null;
  /** The section THEY struggled with. The most persuasive field we hold. */
  ownWeakestSection: string | null;
  attemptNumber: number | null;
}

export interface MatchInput {
  findingKind: string;
  /** The student's weakest section right now. */
  studentWeakSection: string | null;
  studentIsRepeater: boolean;
}

export interface MentorMatch {
  buddyId: string;
  /** Shown to the student. A match we cannot explain is one we should not make. */
  reason: string;
  score: number;
}

/**
 * The mentor to put in front of this student, and WHY.
 *
 * Additive scoring, same architecture as every other ranker in the app: each
 * signal adds points and the winning signals ARE the explanation. Capacity is
 * a hard gate rather than a score — a mentor with no room is not a worse
 * match, they are not a match.
 *
 * Returns null when nobody can take the work. The caller must then refuse the
 * sale rather than assign someone who cannot deliver.
 */
export function matchMentor(mentors: readonly MentorProfile[], input: MatchInput): MentorMatch | null {
  const wanted = FINDING_TO_SPECIALITY[input.findingKind] ?? null;
  const available = mentors.filter((m) => remainingCapacity(m) > 0);
  if (available.length === 0) return null;

  let best: MentorMatch | null = null;
  for (const m of available) {
    let score = 0;
    const why: string[] = [];

    // The speciality that answers their problem. The heaviest signal, because
    // it is the one the student is actually paying to have addressed.
    if (wanted && m.specialities.includes(wanted)) {
      score += 50;
      why.push(SPECIALITY_LABEL[wanted]);
    }

    // Shared weakness — not marketing copy, a fact about two people. Told to a
    // student stuck in VARC, "she struggled with VARC too" is the strongest
    // sentence in the product.
    if (input.studentWeakSection && m.ownWeakestSection === input.studentWeakSection) {
      score += 30;
      why.push(`struggled with ${input.studentWeakSection} herself`);
    }

    // Their strength against the student's weakness.
    if (input.studentWeakSection && m.strongestSection === input.studentWeakSection) {
      score += 20;
      why.push(`strongest in ${input.studentWeakSection}`);
    }

    // Repeater to repeater, only when we actually know they repeated.
    if (input.studentIsRepeater && m.attemptNumber != null && m.attemptNumber > 1) {
      score += 15;
      why.push('cleared it on a second attempt');
    }

    // Spread the load, so one willing mentor is not quietly buried.
    score += remainingCapacity(m);

    if (!best || score > best.score) {
      best = {
        buddyId: m.buddyId,
        // Never "we matched you" with no reason. If nothing specific matched,
        // say the plain true thing rather than inventing a speciality.
        reason: why.length > 0
          ? `${m.fullName} — ${why.join(', ')}`
          : `${m.fullName} has room this week and will look at your preparation`,
        score,
      };
    }
  }
  return best;
}

export const SPECIALITY_LABEL: Record<Speciality, string> = {
  mock_analysis: 'mock analysis',
  strategy: 'strategy & planning',
  consistency: 'consistency & routine',
  second_attempt: 'second attempts',
  section_depth: 'section depth',
};

// ── The upgrade credit ──────────────────────────────────────────────────────

/**
 * The one eligible upgrade credit, or null.
 *
 * Founder ruling (20 Aug 2026): the session is the ENTRY POINT and its price
 * credits against ANY plan checkout sells — monthly, quarterly, Till-CAT,
 * half-year — bought inside the window. Only unspent-on-upgrade,
 * non-refunded credits count, and only ONE — crediting three sessions
 * against one plan is a discount we never agreed to. This is what turns the
 * ₹299 from a cheaper substitute into a low-risk way to find out.
 */
/**
 * Read a student's session credits for the upgrade discount — or THROW.
 *
 * BOUNDARY 2, change 1 (founder GO, 21 Aug). The old shape was
 * `const { data: creditRows } = await ...` with the error never inspected:
 * one failed read and `creditRows` was null, pickUpgradeCredit saw an empty
 * list, and a student who had PAID Rs 299 was silently charged the full
 * plan price. Infrastructure failure became "you have no credit", and
 * because the amount goes into the Razorpay order, the wrong answer is a
 * committed financial transaction — not a display bug a refresh can fix.
 *
 * Same contract as auth's readRole: retry once so a blip stays invisible,
 * then throw. UNKNOWN is the caller's problem to surface loudly; it is
 * never an answer about the student's money. Founder ruling: an order may
 * not be created while the credit state is unknown.
 */
/** Sessions assigned but not yet completed still occupy a mentor's week. */
function weekStartIso(): string {
  const now = new Date();
  const d = new Date(now.getTime() - ((now.getUTCDay() + 6) % 7) * 86_400_000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

/**
 * Read the mentor roster WITH this week's load — or THROW.
 *
 * BOUNDARY 2, change 3. The old loadRoster ran two reads and inspected
 * neither error, and the two failures pointed in OPPOSITE directions:
 *
 *   mentors read fails  -> roster []      -> "sold out"  (false DENIAL)
 *   load read fails     -> load map empty -> every mentor appears free
 *                                            (false PERMISSION - oversell)
 *
 * The second is the expensive one: an infrastructure blip minting
 *  permission to consume a scarce human's week. Same contract as the other
 * domain primitives: retry the pair once, then throw. A roster built from a
 * failed load read must never exist.
 */
export async function readMentorRoster(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: { from: (t: string) => any },
): Promise<MentorProfile[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const [{ data: mentors, error: mErr }, { data: open, error: oErr }] = await Promise.all([
      admin.from('profiles')
        .select('id, full_name, specialities, strongest_section, own_weakest_section, attempt_number, weekly_session_cap')
        .eq('role', 'buddy')
        .not('weekly_session_cap', 'is', null),
      admin.from('session_credits')
        .select('buddy_id')
        .in('status', ['assigned', 'scheduled'])
        .gte('assigned_at', weekStartIso()),
    ]);
    if (!mErr && !oErr) {
      const load = new Map<string, number>();
      for (const c of (open ?? []) as { buddy_id: string | null }[]) {
        if (c.buddy_id) load.set(c.buddy_id, (load.get(c.buddy_id) ?? 0) + 1);
      }
      /* eslint-disable @typescript-eslint/no-explicit-any */
      return ((mentors ?? []) as any[]).map((m) => ({
        buddyId: m.id as string,
        fullName: ((m.full_name as string | null) ?? 'Your Buddy').split(' ')[0],
        specialities: ((m.specialities as string[] | null) ?? []) as Speciality[],
        strongestSection: (m.strongest_section as string | null) ?? null,
        ownWeakestSection: (m.own_weakest_section as string | null) ?? null,
        attemptNumber: (m.attempt_number as number | null) ?? null,
        weeklyCap: (m.weekly_session_cap as number | null) ?? null,
        openThisWeek: load.get(m.id as string) ?? 0,
      }));
      /* eslint-enable @typescript-eslint/no-explicit-any */
    }
    if (attempt === 1) {
      console.error('[readMentorRoster] read failed twice:', mErr?.message ?? oErr?.message);
      throw new Error('Could not read mentor availability');
    }
  }
  throw new Error('unreachable');
}

/**
 * Does this student already have an open (paid/assigned/scheduled) session?
 * TRUE / FALSE from a successful read — or THROW.
 *
 * The old read used maybeSingle() with the error ignored, which failed OPEN
 * in two ways: a read failure returned null ("no open session") and let a
 * student buy a second session while one was in flight, and maybeSingle
 * itself ERRORS when more than one open credit exists - the student with
 * the most open sessions was exactly the one the check waved through.
 *
 * Deliberately not reusing readUpgradeCredits: that primitive answers "what
 * discount applies to a plan", this one answers "is a session in flight" -
 * same error semantic, different business question.
 */
export async function hasOpenSessionCredit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: { from: (t: string) => any },
  studentId: string,
): Promise<boolean> {
  // ── OPEN MEANS "WE STILL OWE THEM A SESSION" ─────────────────────────────
  //
  // Stated as the NEGATIVE of the two terminal states, not as a list of open
  // ones, and that is the whole point. The old list was
  // ('paid','assigned','scheduled'), which silently excluded booking_blocked
  // and assignment_failed — the two states a student lands in when they have
  // PAID and we have failed to deliver. This function gates sessions/book,
  // the route that SELLS a credit. So a student whose mentor cancelled could
  // be sold a second ₹299 while we already owed them the first.
  //
  // That hole was latent until this branch: before 20260827a, rule 5 made a
  // release impossible, so nothing could put a credit into booking_blocked by
  // cancelling. Making the release reachable is what makes this reachable —
  // which is exactly the kind of cross-track consequence a per-track audit
  // does not see.
  //
  // Written as a subtraction so the DEFAULT for any future status is "open".
  // A new state added later fails toward refusing a second sale, rather than
  // toward taking money twice.
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await admin
      .from('session_credits')
      .select('id')
      .eq('student_id', studentId)
      .not('status', 'in', '("completed","refunded")')
      .limit(1);
    if (!error) return ((data ?? []) as unknown[]).length > 0;
    if (attempt === 1) {
      console.error('[hasOpenSessionCredit] read failed twice:', error.message);
      throw new Error('Could not check your existing session');
    }
  }
  throw new Error('unreachable');
}

export async function readUpgradeCredits(
  // Same loose client type the rest of the payment libs use — the callers
  // pass either the real service-role client or a test fake.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: { from: (t: string) => any },
  studentId: string,
): Promise<{ id: string; created_at: string; status: string; amount_paise: number | null; credited_to_payment_id: string | null }[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await admin
      .from('session_credits')
      .select('id, created_at, status, amount_paise, credited_to_payment_id')
      .eq('student_id', studentId);
    if (!error) return (data ?? []) as Awaited<ReturnType<typeof readUpgradeCredits>>;
    if (attempt === 1) {
      console.error('[readUpgradeCredits] read failed twice:', error.message);
      throw new Error('Could not read session credits');
    }
  }
  return [];
}

export function pickUpgradeCredit(
  credits: readonly { id: string; created_at: string; status: CreditStatus; amount_paise: number; credited_to_payment_id: string | null }[],
  now: Date = new Date(),
): { id: string; paise: number } | null {
  const cutoff = now.getTime() - CREDIT_WINDOW_DAYS * 86_400_000;
  const eligible = credits.filter((c) =>
    c.status !== 'refunded' &&
    c.credited_to_payment_id == null &&
    Date.parse(c.created_at) >= cutoff,
  );
  if (eligible.length === 0) return null;
  const best = eligible.reduce((a, b) => (b.amount_paise > a.amount_paise ? b : a));
  return { id: best.id, paise: best.amount_paise };
}

/** How much of a past session payment counts against a plan now. */
export function upgradeCreditPaise(
  credits: readonly { id: string; created_at: string; status: CreditStatus; amount_paise: number; credited_to_payment_id: string | null }[],
  now: Date = new Date(),
): number {
  return pickUpgradeCredit(credits, now)?.paise ?? 0;
}

// ── What happens to the ₹299 when its session ends ─────────────────────────
//
// THE authority for that question. Before this existed there was none: the
// credit lifecycle had no terminal writer at all. Nothing anywhere set
// 'completed', so a delivered session left its credit at 'scheduled'
// forever — and because hasOpenSessionCredit() counts 'scheduled' as open and
// readMentorRoster() counts it against the mentor's weekly cap, every session
// we successfully delivered permanently consumed a seat and permanently
// blocked that student from buying a second one. The product was quietly
// ratcheting itself toward sold-out, one happy customer at a time.
//
// Cancellation was worse. The credit stayed welded to a session that would
// never happen, with no exit in code (see 20260827a) — a silent refund the
// student had to notice and ask for.
//
// One function, called from every terminal transition, so the two state
// machines cannot disagree about the same event. video_sessions remains the
// delivery authority; this reads that decision and settles the entitlement.

export type SessionOutcome = 'completed' | 'cancelled' | 'expired';

export type CreditSettlement =
  | { settled: 'completed' }
  | { settled: 'released'; creditId: string }   // back to booking_blocked, rebookable
  | { settled: 'none'; reason: 'no_credit' | 'already_terminal' | 'already_settled' | 'read_failed' | 'write_failed' };

/**
 * Settle the credit attached to a session that just reached a terminal state.
 *
 * Never throws: a session genuinely completed even if we could not settle its
 * credit, and failing the mentor's close-out because of bookkeeping would be
 * the worse error. Failures are reported in the return value and logged, so a
 * stuck credit surfaces rather than silently disappearing.
 */
/**
 * A credit that cannot be booked AT ALL — no session was ever created, so there
 * is nothing to settle.
 *
 * settleCreditForSession handles the delivery that FAILED: a session existed,
 * it was cancelled or expired, and the credit is released back. This is the
 * case before that — the student went to pick a time and the mentor had no
 * calendar, so /api/sessions/schedule returned `needs_team` and told them "our
 * team will set your session time for you". That promise had no owner.
 *
 * It lives HERE because booking_blocked is a terminal credit state and this
 * file is its one authority — session-credit-writers.guard says so, and it is
 * right: a second writer is a second answer to "what does this student own".
 * The route that detects the block does not write the credit; it asks this.
 *
 * IDEMPOTENT by construction: creditBlockPatch returns null when the same block
 * is already recorded, so re-detecting leaves failure_at alone. That timestamp
 * means "stuck since", and it is what decides how loudly the exception speaks.
 */
import { creditBlockPatch } from './booking-blocked';
import type { UnbookableReason } from './session-assignment';

export async function markBookingBlocked(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: { from: (t: string) => any },
  creditId: string,
  reason: UnbookableReason,
): Promise<{ marked: boolean; reason?: 'unchanged' | 'lost_race' | 'read_failed' | 'write_failed' }> {
  const { data: current, error: readErr } = await admin
    .from('session_credits')
    .select('status, failure_reason, failure_at')
    .eq('id', creditId)
    .maybeSingle();

  if (readErr || !current) {
    console.error('[markBookingBlocked] read failed', creditId, readErr?.message);
    return { marked: false, reason: 'read_failed' };
  }

  const patch = creditBlockPatch(
    {
      status: current.status as string,
      failure_reason: (current.failure_reason as string | null) ?? null,
      failure_at: (current.failure_at as string | null) ?? null,
    },
    reason,
    new Date().toISOString(),
  );
  if (!patch) return { marked: false, reason: 'unchanged' };

  // Guarded on the status we read. A booking that succeeds between the read and
  // the write moves the credit to 'scheduled', and this then matches zero rows
  // rather than dragging a live booking back into blocked.
  const { data: updated, error: writeErr } = await admin
    .from('session_credits')
    .update(patch)
    .eq('id', creditId)
    .eq('status', current.status as string)
    .select('id');

  if (writeErr) {
    console.error('[markBookingBlocked] write failed', creditId, writeErr.message);
    return { marked: false, reason: 'write_failed' };
  }
  if (!updated?.length) return { marked: false, reason: 'lost_race' };
  return { marked: true };
}

export async function settleCreditForSession(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: { from: (t: string) => any },
  sessionId: string,
  outcome: SessionOutcome,
): Promise<CreditSettlement> {
  // The docstring above has always said "never throws"; until 27 Aug that was
  // an intention rather than a fact. A client that throws rather than
  // returning { error } — a dead connection, a transport fault — propagated
  // out of here into callers that do not catch, and every one of them calls
  // this AFTER the session state has already changed. The mentor would have
  // seen a 500 for a cancellation that had, in fact, happened. Now the
  // failure is reported the same way every other failure here is.
  try {
    return await settle(admin, sessionId, outcome);
  } catch (err) {
    console.error('[settleCredit] threw for session', sessionId, err);
    return { settled: 'none', reason: 'write_failed' };
  }
}

async function settle(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: { from: (t: string) => any },
  sessionId: string,
  outcome: SessionOutcome,
): Promise<CreditSettlement> {
  const { data: credit, error } = await admin
    .from('session_credits')
    .select('id, status, buddy_id')
    .eq('video_session_id', sessionId)
    .maybeSingle();

  if (error) {
    console.error('[settleCredit] could not read the credit for session', sessionId, error.message);
    return { settled: 'none', reason: 'read_failed' };
  }
  // Orientation and buddy-plan sessions carry no credit. That is normal.
  if (!credit) return { settled: 'none', reason: 'no_credit' };
  if (credit.status === 'completed' || credit.status === 'refunded') {
    return { settled: 'none', reason: 'already_terminal' };
  }

  if (outcome === 'completed') {
    // Rule (4) requires the session to be completed first — it is, that is why
    // we are here. Rule (9) requires a terminal credit to owe nobody anything.
    // .select() so the ROW COUNT is knowable. Without it a status-guarded
    // update that matched nothing is indistinguishable from one that worked,
    // and this function would report success for a credit it never touched.
    const { data: done, error: e } = await admin
      .from('session_credits')
      .update({ status: 'completed', owner: null, next_action: null })
      .eq('id', credit.id)
      .eq('status', 'scheduled')
      .select('id');
    if (e) {
      console.error('[settleCredit] complete failed for credit', credit.id, e.message);
      return { settled: 'none', reason: 'write_failed' };
    }
    if (!done || done.length === 0) return { settled: 'none', reason: 'already_settled' };
    return { settled: 'completed' };
  }

  // Cancelled or expired: the delivery failed, so the entitlement goes back
  // to the student as a rebookable, OWNED failure. Rule (6) forces the owner
  // and next_action; rule (5)'s one exception (20260827a) permits the unlink
  // only in exactly this shape.
  const { data: released, error: e } = await admin
    .from('session_credits')
    .update({
      status: 'booking_blocked',
      video_session_id: null,
      owner: 'ops',
      next_action: 'Session did not happen — rebook this student with their mentor',
      failure_reason: `session_${outcome}`,
      failure_at: new Date().toISOString(),
    })
    .eq('id', credit.id)
    .in('status', ['scheduled', 'assigned'])
    .select('id');
  if (e) {
    console.error('[settleCredit] release failed for credit', credit.id, e.message);
    return { settled: 'none', reason: 'write_failed' };
  }
  // NO DOUBLE RELEASE. The status guard already made the second write a
  // no-op at the database; this makes the second CALL say so. It matters
  // because the honest answer is what a caller would key a notification off:
  // a cancel racing an expiry must produce one release and one telling, not
  // two. Today no caller branches on this value — which is exactly when a
  // lying return costs nothing to fix and everything to discover later.
  if (!released || released.length === 0) return { settled: 'none', reason: 'already_settled' };
  return { settled: 'released', creditId: credit.id as string };
}
