// ── WHAT WAS SAID, EVERY TIME IT WAS SAID ───────────────────────────────────
//
// Founder order, 4 Sep 2026: "salesman should also be able to see their last
// remarks which should be visible next time, for each remark they have
// filled." One module owns the answer, so the calling card, the student 360
// and the rep's own summary can never disagree about what a student said.
//
// WHY THIS FILE EXISTS AT ALL — the production bug it was written to kill:
//
//   call-queue read sales_activity with NO provenance filter and kept the
//   single newest row as "Last time". But lead intake writes bookkeeping into
//   the same table, and on 4 Sep 2026 the newest row for 272 of the 319
//   touched students was one of those:
//
//     "Daily intake -> Neelam Singh: 50 of 50 new-per-day used, book ..."
//
//   So the most valuable block on the calling card — the one that is supposed
//   to carry the student's own words into the next conversation — was showing
//   a rep our internal lead-distribution log, formatted as if the student had
//   said it. 272 students, against 47 with a real human touch. The block was
//   not merely thin; it was mostly wrong.
//
// A REMARK IS A HUMAN TOUCH AND NOTHING ELSE. provenance='self_reported' AND
// actor_id IS NOT NULL. That pair is the definition: a person at CareerRai
// deliberately recorded what happened. Assignment rows, vendor imports and
// observed events are all real history and all belong on the 360's timeline —
// they are simply not remarks, and they may never occupy the place where a
// rep looks to remember a conversation.
//
// SALES-OS §8 (3 Sep amendment) already makes a typed remark mandatory on
// every connected outcome. This is the other half of that bargain: if we
// demand the words, we owe the rep the words back, every time, before they
// dial.

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The one provenance value that means "a human at CareerRai recorded this". */
export const HUMAN_PROVENANCE = 'self_reported';

/**
 * How many remarks travel with a calling card.
 *
 * Five, matching what the established CRMs converged on for a pre-call
 * context panel (HubSpot's lead record shows the last five activities;
 * Pipedrive's Focus section shows the pinned note plus recent history). Enough
 * that a three-call relationship arrives whole, small enough that the card
 * stays a card. The full history is always one tap away on the 360.
 */
export const MAX_REMARKS_ON_CARD = 5;

/** A row as it comes out of sales_activity. */
export interface RemarkRow {
  student_id: string;
  created_at: string;
  status: string | null;
  note: string | null;
  provenance: string | null;
  actor_id: string | null;
}

export interface Remark {
  atIso: string;
  /** The disposition the rep chose — 'interested', 'no_answer', ... */
  outcome: string | null;
  note: string | null;
  /** True when the rep typed these words themselves (see isTypedRemark). */
  typed: boolean;
  actorId: string | null;
  /** Display label for the rep who wrote it, when we can resolve one. */
  by: string | null;
}

export interface RemarkHistory {
  /** Newest first, capped. */
  remarks: Remark[];
  /** How many human touches exist in total — may exceed remarks.length. */
  total: number;
  /** The newest touch of any kind. */
  last: Remark | null;
  /**
   * The newest touch whose note the rep actually TYPED.
   *
   * This is the field the calling card leads with, and it is deliberately
   * NOT the same as `last`. The commonest disposition in production is
   * no_answer, which carries the auto-note "Did not pick up" — so on the old
   * card, one unanswered dial buried the real conversation from the call
   * before it. The words survive the silence.
   */
  lastTyped: Remark | null;
}

export const EMPTY_HISTORY: RemarkHistory = { remarks: [], total: 0, last: null, lastTyped: null };

/** Is this row a human touch — the only kind of row that can be a remark? */
export function isHumanTouch(provenance: string | null, actorId: string | null): boolean {
  return provenance === HUMAN_PROVENANCE && actorId != null && actorId !== '';
}

/**
 * Did the rep actually WRITE this remark, or did the system?
 *
 * The auto-notes ('Did not pick up', the skip-reason echo, and the legacy
 * one-tap message note) are honest records but they are not the rep's words.
 * Lives here rather than in sales-yesterday because two very different
 * surfaces now need the same judgement — the daily snapshot counts typed
 * remarks, and the calling card leads with the newest one — and two copies of
 * this rule would drift the day somebody adds a sixth auto-note.
 */
export function isTypedRemark(status: string | null, note: string | null): boolean {
  if (!note || note.trim().length === 0) return false;
  if (status === 'no_answer' && note === 'Did not pick up') return false;
  if (status === 'skipped' && note.startsWith('Skipped: ')) return false;
  if (status === 'messaged' && note === 'Sent a WhatsApp message') return false; // pre-3-Sep one-tap rows
  return true;
}

/**
 * Group raw sales_activity rows into per-student remark history.
 *
 * `rows` may arrive in ANY order and may contain non-human rows; both are
 * handled here so no caller has to remember either rule. `labelById` is the
 * staff directory's rendering map (lib/sales-authz) — a rep whose id we
 * cannot resolve renders without attribution rather than with a raw uuid.
 *
 * `total` counts every human touch seen, so a card can honestly say "3 of 7"
 * even though only the newest `cap` travel with it.
 */
export function buildRemarkHistories(
  rows: RemarkRow[] | null | undefined,
  labelById?: Map<string, string> | null,
  cap: number = MAX_REMARKS_ON_CARD,
): Map<string, RemarkHistory> {
  const byStudent = new Map<string, Remark[]>();
  for (const r of (rows ?? [])) {
    if (!isHumanTouch(r.provenance ?? null, r.actor_id ?? null)) continue;
    const actorId = (r.actor_id as string | null) ?? null;
    const list = byStudent.get(r.student_id);
    const remark: Remark = {
      atIso: r.created_at,
      outcome: (r.status as string | null) ?? null,
      note: (r.note as string | null) ?? null,
      typed: isTypedRemark(r.status ?? null, r.note ?? null),
      actorId,
      by: (actorId && labelById?.get(actorId)) ?? null,
    };
    if (list) list.push(remark);
    else byStudent.set(r.student_id, [remark]);
  }

  const out = new Map<string, RemarkHistory>();
  for (const [studentId, all] of byStudent) {
    // Sorted here rather than trusted from the query: this function is also
    // called from the 360 and from tests, and a silently mis-ordered history
    // would put an old conversation on the card as the current one.
    all.sort((a, b) => Date.parse(b.atIso) - Date.parse(a.atIso));
    out.set(studentId, {
      remarks: all.slice(0, Math.max(1, cap)),
      total: all.length,
      last: all[0] ?? null,
      lastTyped: all.find((r) => r.typed) ?? null,
    });
  }
  return out;
}

/** One remark, with the student it belongs to — for a rep's own log. */
export interface RepRemark extends Remark {
  studentId: string;
  studentName: string | null;
}

/**
 * Every remark THIS rep has written, newest first.
 *
 * The second half of the founder's 4 Sep order — "for each remark they have
 * filled". A counsellor's remarks were previously write-only from their own
 * side: they typed them all day and the only person who could read them back
 * was the founder, on an admin page. Being able to re-read your own week is
 * how a rep notices that four students in a row said the same thing, which is
 * the raw material of the product feedback SALES-OS §8 exists to collect.
 *
 * Scoped to `repId` and nothing else — this is a rep reading their OWN work,
 * so it needs no lead-ownership check. Auto-notes are excluded: they are the
 * system's words, and a log padded with sixty identical 'Did not pick up'
 * lines would bury the remarks it exists to show.
 *
 * Never throws. A failed read renders an empty log on a summary page rather
 * than taking down a rep's whole summary.
 */
export async function repRemarks(
  admin: any, repId: string, limit = 60,
): Promise<{ items: RepRemark[]; failed: boolean }> {
  const { data, error } = await admin
    .from('sales_activity')
    .select('student_id, created_at, status, note, provenance, actor_id')
    .eq('actor_id', repId)
    .eq('provenance', HUMAN_PROVENANCE)
    .not('note', 'is', null)
    .order('created_at', { ascending: false })
    .limit(Math.max(1, limit) * 3);   // headroom for the auto-notes filtered below
  if (error || !data) return { items: [], failed: true };

  const rows = (data as RemarkRow[]).filter(
    (r) => isHumanTouch(r.provenance ?? null, r.actor_id ?? null) && isTypedRemark(r.status ?? null, r.note ?? null),
  ).slice(0, limit);
  if (rows.length === 0) return { items: [], failed: false };

  const nameById = new Map<string, string>();
  const ids = [...new Set(rows.map((r) => r.student_id))];
  const { data: profs } = await admin.from('profiles').select('id, full_name').in('id', ids);
  for (const p of ((profs ?? []) as any[])) nameById.set(p.id as string, (p.full_name as string | null) ?? '');

  return {
    failed: false,
    items: rows.map((r) => ({
      studentId: r.student_id,
      studentName: nameById.get(r.student_id) || null,
      atIso: r.created_at,
      outcome: (r.status as string | null) ?? null,
      note: (r.note as string | null) ?? null,
      typed: true,
      actorId: (r.actor_id as string | null) ?? null,
      by: null,
    })),
  };
}
