import type { CallLead } from '@/lib/call-queue';
import type { OpportunityRow } from '@/lib/sales-checkpoint';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── RECORDING THE OFFER ─────────────────────────────────────────────────────
//
// The queue is computed live and keeps nothing. That is the right design for
// deciding who matters NOW, and it is exactly wrong for answering, at 9pm,
// "what were they given this morning?" — by then the morning's list has been
// recomputed away, and a student who was skipped looks identical to one who was
// never chosen.
//
// So the moment a queue is built for a counsellor, the offer is written down.
// The counsellor is never asked to do this and never sees it happen
// (SALES-OS.md §0: the system knows what it gave; their job is the
// conversation).
//
// BEST-EFFORT, ALWAYS. This runs inside a page render. If the write fails, the
// counsellor still gets their queue — losing the audit trail for one day is bad,
// but blocking somebody's whole working day on an analytics insert would be
// far worse. Failures are logged loudly and the page carries on.
//
// IDEMPOTENT BY CONSTRAINT, not by care. The queue is rebuilt on every page
// load, so this runs many times a day with overlapping students. The unique
// (rep_id, student_id, ist_day) index makes every run after the first a no-op —
// and, crucially, an existing row is never UPDATED. `surfaced_at` therefore
// records when the student was FIRST offered today, and a card that has already
// been worked cannot be silently reset to unworked by a page refresh.

/** IST calendar day, matching the clock the queue itself uses. */
export function istDay(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/**
 * Write today's offer for one counsellor. Never throws.
 *
 * Returns how many rows were newly created — which is 0 on every rebuild after
 * the first, and is the number worth logging when it is unexpectedly small.
 */
export async function recordSurfaced(
  admin: any,
  repId: string,
  queue: readonly CallLead[],
  now: Date = new Date(),
): Promise<number> {
  if (queue.length === 0) return 0;
  const day = istDay(now);

  const rows = queue.map((lead, i) => ({
    student_id: lead.studentId,
    rep_id: repId,
    ist_day: day,
    objective: lead.objective,
    lane: lead.dueReason,
    // Stored as shown, not recomputed later: six weeks from now the signals
    // will have moved on, and "why did we call this student on 29 August" must
    // still return the sentence the counsellor actually read.
    why_today: lead.why[0]?.slice(0, 500) || lead.dueLabel,
    // Position in today's deck. The founder's coverage question is about the
    // TOP of the list, so the position has to be recorded with the offer.
    rank: i,
  }));

  try {
    const { data, error } = await admin
      .from('sales_opportunity')
      .upsert(rows, { onConflict: 'rep_id,student_id,ist_day', ignoreDuplicates: true })
      .select('id');
    if (error) {
      console.error('[sales-opportunity] could not record today\'s offer:', error.message);
      return 0;
    }
    return (data ?? []).length;
  } catch (e) {
    console.error('[sales-opportunity] record threw:', e instanceof Error ? e.message : String(e));
    return 0;
  }
}

/**
 * Mark today's offer worked, when a disposition lands.
 *
 * Scoped to the IST day and to rows that are still unworked, so a second
 * disposition on the same student the same day does not overwrite the first
 * outcome — the first real conversation is the one that counts as work, and
 * sales_activity keeps the full sequence regardless.
 *
 * Never throws: the counsellor's call is already saved by the time this runs,
 * and losing a coverage row must not tell them their logged call did not stick.
 */
export async function markWorked(
  admin: any,
  repId: string,
  studentId: string,
  outcome: string,
  now: Date = new Date(),
): Promise<boolean> {
  try {
    const { error } = await admin
      .from('sales_opportunity')
      // closed_at travels with worked_at, always: a worked card is a closed
      // card, and letting the two drift would put a row in a state the CHECK
      // in 20260903b forbids (and the founder's three numbers could not add up).
      .update({ worked_at: now.toISOString(), outcome, closed_at: now.toISOString(), close_reason: 'worked' })
      .eq('rep_id', repId)
      .eq('student_id', studentId)
      .eq('ist_day', istDay(now))
      .is('worked_at', null);
    if (error) {
      console.error('[sales-opportunity] could not mark worked:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[sales-opportunity] mark threw:', e instanceof Error ? e.message : String(e));
    return false;
  }
}

/** Read one counsellor's day for the checkpoint. Returns [] rather than throwing. */
export async function readToday(
  admin: any,
  repId: string,
  now: Date = new Date(),
): Promise<OpportunityRow[]> {
  try {
    const { data, error } = await admin
      .from('sales_opportunity')
      .select('student_id, objective, rank, worked_at, outcome, closed_at, close_reason, skip_reason')
      .eq('rep_id', repId)
      .eq('ist_day', istDay(now))
      .order('rank', { ascending: true });
    if (error) {
      console.error('[sales-opportunity] could not read today:', error.message);
      return [];
    }
    return ((data ?? []) as any[]).map((r) => ({
      studentId: r.student_id as string,
      objective: r.objective as OpportunityRow['objective'],
      rank: Number(r.rank),
      workedAt: (r.worked_at as string | null) ?? null,
      outcome: (r.outcome as string | null) ?? null,
      closedAt: (r.closed_at as string | null) ?? null,
      closeReason: (r.close_reason as OpportunityRow['closeReason']) ?? null,
      skipReason: (r.skip_reason as string | null) ?? null,
    }));
  } catch (e) {
    console.error('[sales-opportunity] read threw:', e instanceof Error ? e.message : String(e));
    return [];
  }
}

/**
 * Close today's card WITHOUT acting on the student (founder, 3 Sep 2026).
 *
 * worked_at stays null on purpose — a skip is not work, and coverage must
 * never count it as one. Scoped to today and to rows that are still open, so
 * a skip can never overwrite a real disposition that landed first.
 *
 * Never throws: failing to record a skip must not cost the counsellor the tap.
 */
export async function markSkipped(
  admin: any,
  repId: string,
  studentId: string,
  skipReason: string,
  now: Date = new Date(),
): Promise<boolean> {
  try {
    const { error } = await admin
      .from('sales_opportunity')
      .update({ closed_at: now.toISOString(), close_reason: 'skipped', skip_reason: skipReason })
      .eq('rep_id', repId)
      .eq('student_id', studentId)
      .eq('ist_day', istDay(now))
      .is('closed_at', null);
    if (error) {
      console.error('[sales-opportunity] could not mark skipped:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[sales-opportunity] skip threw:', e instanceof Error ? e.message : String(e));
    return false;
  }
}

export interface DayCloseResult {
  ok: boolean;
  /** Cards nobody marked, now recorded as such. */
  closed: number;
  /** IST days that were swept — normally one, more if a sweep was missed. */
  days: string[];
  error?: string;
}

/**
 * The end-of-day sweep: every card still open from a day that has ENDED is
 * stamped `not_marked`.
 *
 * This is what turns "the list doesn't make sense" into a number. Until today
 * an untouched card was an absence — indistinguishable from a card that was
 * never offered — so nobody, including the counsellor, could tell whether a
 * day had been worked. Now the day closes itself and the record is total:
 * every card offered ends as worked, skipped, or not marked.
 *
 * Deliberately swept by DAY, not by age in hours: the shift ends at 21:00 IST
 * and the sweep runs after it, so "the day ended" is a calendar fact both the
 * counsellor and the founder can check. Days before today are swept too, so a
 * missed run repairs itself on the next one instead of leaving a permanent
 * hole in the record.
 */
export async function closeDay(
  admin: any,
  now: Date = new Date(),
): Promise<DayCloseResult> {
  const today = istDay(now);
  try {
    const { data, error } = await admin
      .from('sales_opportunity')
      .update({ closed_at: now.toISOString(), close_reason: 'not_marked' })
      .is('closed_at', null)
      .lt('ist_day', today)
      .select('ist_day');
    if (error) {
      console.error('[sales-opportunity] day close failed:', error.message);
      return { ok: false, closed: 0, days: [], error: error.message };
    }
    const rows = (data ?? []) as { ist_day: string }[];
    return { ok: true, closed: rows.length, days: [...new Set(rows.map((r) => r.ist_day))].sort() };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[sales-opportunity] day close threw:', msg);
    return { ok: false, closed: 0, days: [], error: msg };
  }
}
