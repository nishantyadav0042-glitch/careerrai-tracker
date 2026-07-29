// Report + block for 1:1 chat — the two halves of Apple Guideline 1.2 and Play's
// UGC policy that this app was missing.
//
// Both stores require, for ANY app carrying user-generated content: a filter, a
// way to report offensive content, the ability to block abusive users, and
// published contact info. Daily Pick had the filter and the report; the mentor
// chat had neither, and nothing anywhere had a block.
//
// Deliberately NOT a social-network block. This is a 1:1 assigned pairing, so
// "block" means: no more messages either way, the thread goes read-only, and the
// pairing is surfaced to the founder for reassignment. A student is never left
// with no route forward — that would punish them for reporting.

/** Reasons offered in the sheet. Kept short; a free-text note carries detail. */
export const CHAT_REPORT_REASONS = [
  { id: 'abusive',     label: 'Abusive or offensive language' },
  { id: 'harassment',  label: 'Harassment or unwanted contact' },
  { id: 'spam_or_ad',  label: 'Spam or advertising' },
  { id: 'off_topic',   label: 'Not about CAT prep at all' },
  { id: 'safety',      label: 'Made me feel unsafe' },
  { id: 'other',       label: 'Something else' },
] as const;

export type ChatReportReason = (typeof CHAT_REPORT_REASONS)[number]['id'];

export const REPORT_REASON_IDS: string[] = CHAT_REPORT_REASONS.map((r) => r.id);
export const MAX_REPORT_NOTE = 1000;

export function isValidReportReason(v: unknown): v is ChatReportReason {
  return typeof v === 'string' && REPORT_REASON_IDS.includes(v);
}

/**
 * Is there a block between these two people, in EITHER direction?
 *
 * Direction-agnostic on purpose. If a student blocks a mentor, the mentor must
 * also stop being able to send — a one-way block that still lets the abusive
 * party talk is not a block, and it is exactly what the guideline is about.
 *
 * Pure so the send route and the thread renderer can't drift apart.
 */
export function isBlockedPair(
  blocks: { blocker_id: string; blocked_id: string }[] | null | undefined,
  a: string,
  b: string,
): boolean {
  if (!blocks || blocks.length === 0) return false;
  return blocks.some(
    (r) =>
      (r.blocker_id === a && r.blocked_id === b) ||
      (r.blocker_id === b && r.blocked_id === a),
  );
}
