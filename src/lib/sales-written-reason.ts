// ── LOG BREAKERS AND DAILY LOGGERS: THE REASON IS WRITTEN, NOT PICKED ────────
//
// Founder, 24 Sep 2026: "I want him to write the reason instead of just
// picking." For these two lanes the call exists to learn WHY — why a student
// stopped logging, or why one logs every day — and a category picked from a
// list is the rep's summary, not the student's reason. So on these cards the
// category picker is not offered, and a connected call cannot be saved
// without a written sentence.
//
// `callback` is exempt from the sentence: the student said "call me later"
// and has not given a reason yet. The ordinary required note still applies.
// Unreached outcomes are exempt: nobody spoke, so there is nothing to write.
//
// Client (call-deck) and server (/api/sales/log) call the same function, so
// the button and the API can never disagree.

export const WRITTEN_REASON_LANES: ReadonlySet<string> = new Set(['log_breaker', 'daily_logger']);
export const WRITTEN_REASON_OUTCOMES: ReadonlySet<string> = new Set(['interested', 'converted', 'not_interested', 'dnd']);
export const MIN_REASON_CHARS = 30;
export const MIN_REASON_WORDS = 6;

export function needsWrittenReason(lane: string | null | undefined, outcome: string): boolean {
  return lane != null && WRITTEN_REASON_LANES.has(lane) && WRITTEN_REASON_OUTCOMES.has(outcome);
}

/** Null when the note is acceptable; otherwise the sentence the rep reads. */
export function writtenReasonProblem(lane: string | null | undefined, outcome: string, note: string): string | null {
  if (!needsWrittenReason(lane, outcome)) return null;
  const text = note.trim();
  const words = text.split(/\s+/).filter((w) => /\p{L}|\p{N}/u.test(w));
  if (text.length >= MIN_REASON_CHARS && words.length >= MIN_REASON_WORDS) return null;
  return lane === 'log_breaker'
    ? 'Write why they stopped logging, in their words (at least one full sentence).'
    : 'Write what they told you about the app, in their words (at least one full sentence).';
}

/** The prompt in the remark box for these lanes. */
export function writtenReasonPrompt(lane: string | null | undefined): string | null {
  if (lane === 'log_breaker') return 'Why did they stop logging? Their words: an app error, something missing, no time… (required)';
  if (lane === 'daily_logger') return 'Why do they log daily? What do they like, what is missing or broken? Their words (required)';
  return null;
}
