import { chunkIds } from '@/lib/truth/batch';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Follow-up, as a thing that happened rather than a field that moved ──────
//
// `lead_outreach.next_action_at` is one mutable timestamp. Every disposition
// OVERWRITES it. So the single most operationally important question a founder
// asks — "the rep promised to call this student back on Tuesday; did she?" —
// has never been answerable, because Tuesday's promise is erased by Wednesday's.
//
// The cadence field stays: it is what buildCallQueue reads, and re-pointing the
// queue at a new table would be a second authority for the same fact. This
// module is the HISTORY alongside it. A follow-up is created when a promise is
// made, and closed when something actually discharges it — with a pointer to
// the activity row that did, so completion is evidence rather than a claim
// about itself.
//
// Failure policy: these writes are deliberately best-effort at the call site.
// The disposition is already saved and confirmed to the rep; losing the history
// footnote must never surface as "your logged call did not stick". Every
// failure is logged and surfaces in the data-quality panel instead.

export type FollowupChannel = 'phone' | 'whatsapp' | 'sms' | 'email' | 'in_app' | 'system';
export type FollowupStatus = 'open' | 'completed' | 'cancelled' | 'no_response';

export interface OpenFollowup {
  id: number;
  studentId: string;
  ownerId: string;
  dueAt: string;
  reason: string | null;
  channel: FollowupChannel | null;
  createdAt: string;
}

/** Bucket an open follow-up by its due time. The founder's four columns. */
export type DueBucket = 'overdue' | 'today' | 'upcoming';

export function bucketFor(dueAtIso: string, nowMs: number): DueBucket {
  const due = new Date(dueAtIso).getTime();
  if (due < nowMs) return 'overdue';
  const istToday = new Date(nowMs + 5.5 * 3600_000).toISOString().slice(0, 10);
  const istDue = new Date(due + 5.5 * 3600_000).toISOString().slice(0, 10);
  return istDue === istToday ? 'today' : 'upcoming';
}

/**
 * Record a promise. Idempotent per (student, owner, due minute) so a
 * double-submitted disposition does not create two identical obligations.
 */
export async function scheduleFollowup(
  admin: any,
  input: {
    studentId: string; ownerId: string; createdBy: string; dueAt: string;
    reason?: string | null; channel?: FollowupChannel | null;
  },
): Promise<number | null> {
  try {
    // Collapse an accidental duplicate: same student, same owner, still open,
    // same minute. Not a unique index, because two genuinely different
    // follow-ups at the same minute are legal — this only guards the retry.
    const minute = input.dueAt.slice(0, 16);
    const { data: existing } = await admin
      .from('sales_followup')
      .select('id, due_at')
      .eq('student_id', input.studentId)
      .eq('owner_id', input.ownerId)
      .eq('status', 'open')
      .limit(20);
    for (const row of (existing ?? []) as any[]) {
      if (typeof row.due_at === 'string' && row.due_at.slice(0, 16) === minute) return row.id as number;
    }

    const { data, error } = await admin.from('sales_followup').insert({
      student_id: input.studentId,
      owner_id: input.ownerId,
      created_by: input.createdBy,
      due_at: input.dueAt,
      reason: input.reason ?? null,
      channel: input.channel ?? null,
      status: 'open',
    }).select('id').single();
    if (error) {
      console.error('[followup] schedule failed:', error.message);
      return null;
    }
    return (data?.id as number) ?? null;
  } catch (e) {
    console.error('[followup] schedule threw:', e);
    return null;
  }
}

/**
 * A contact happened — discharge whatever was owed.
 *
 * Any open follow-up for this student that was due at or before now is closed
 * by this contact. Ones due in the future are left alone: calling early does
 * not cancel a promise made for next week.
 *
 * `no_answer` closes the obligation as `no_response` rather than `completed`.
 * "I tried and nobody picked up" and "I spoke to them" are different facts, and
 * a follow-up system that cannot tell them apart flatters the rep.
 */
export async function completeDueFollowups(
  admin: any,
  input: { studentId: string; actorId: string; outcome: string; activityId?: number },
): Promise<number> {
  try {
    const now = new Date().toISOString();
    const { data: open, error } = await admin
      .from('sales_followup')
      .select('id, due_at')
      .eq('student_id', input.studentId)
      .eq('status', 'open')
      .lte('due_at', now);
    if (error) {
      console.error('[followup] read open failed:', error.message);
      return 0;
    }
    const ids = ((open ?? []) as any[]).map((r) => r.id as number);
    if (ids.length === 0) return 0;

    const completed = input.outcome !== 'no_answer';
    // Chunked, not one giant .in(). One student's open follow-ups are normally
    // one or two rows — and "normally small" is exactly the assumption the
    // population-read guard exists to refuse. B3b doctrine: the request size is
    // bounded by the chunk, and a partial failure is reported rather than
    // rounded down to success.
    let closed = 0;
    for (const chunk of chunkIds(ids)) {
      const { error: upErr } = await admin.from('sales_followup').update({
        status: completed ? 'completed' : 'no_response',
        // The coherence CHECK requires both of these together for 'completed'.
        completed_at: completed ? now : null,
        completed_by: completed ? input.actorId : null,
        outcome: input.outcome,
        completion_activity_id: input.activityId ?? null,
      }).in('id', chunk);
      if (upErr) {
        console.error('[followup] close failed:', upErr.message);
        return closed; // partial, and honest about it
      }
      closed += chunk.length;
    }
    return closed;
  } catch (e) {
    console.error('[followup] close threw:', e);
    return 0;
  }
}

/**
 * Open follow-ups, optionally scoped to one owner.
 *
 * Explicitly capped, and the cap is REPORTED. A silent top-N is how a founder
 * ends up reading "37 overdue" when the real number is 500 — the same class of
 * defect as a naked zero.
 */
export async function listOpenFollowups(
  admin: any,
  opts: { ownerId?: string | null; limit?: number } = {},
): Promise<OpenFollowup[] | null> {
  let q = admin
    .from('sales_followup')
    .select('id, student_id, owner_id, due_at, reason, channel, created_at')
    .eq('status', 'open')
    .order('due_at', { ascending: true })
    .limit(opts.limit ?? 500);
  if (opts.ownerId) q = q.eq('owner_id', opts.ownerId);
  const { data, error } = await q;
  // null, not [] — an unreadable follow-up list is not an empty one, and the
  // renderer must be able to say DATA QUALITY FAILURE rather than "all clear".
  if (error) {
    console.error('[followup] list failed:', error.message);
    return null;
  }
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id, studentId: r.student_id, ownerId: r.owner_id, dueAt: r.due_at,
    reason: r.reason ?? null, channel: r.channel ?? null, createdAt: r.created_at,
  }));
}

export interface FollowupCounts { overdue: number; today: number; upcoming: number }

export function countBuckets(rows: OpenFollowup[], nowMs: number): FollowupCounts {
  const out: FollowupCounts = { overdue: 0, today: 0, upcoming: 0 };
  for (const r of rows) out[bucketFor(r.dueAt, nowMs)]++;
  return out;
}
