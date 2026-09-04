// ── "YOUR NOTE SAYS THEY DIDN'T ANSWER" ─────────────────────────────────────
//
// Founder order, 4 Sep 2026, from reading the day's own calls:
//
//     12:36 PM  outcome = interested   remark = "not pick"
//     02:47 PM  outcome = callback     remark = "not pick"
//
// Both mean nobody answered. Both were recorded as CONNECTED outcomes, which
// are the ones that assert a human spoke. Four such rows in two days — around
// 15% of everything one rep marks — and each carries real consequences:
//
//   • the student enters the follow-up or callback lane as a warm lead
//   • the retry clock is wrong (a callback waits for a time nobody promised)
//   • "interested" and "callback" counts on the Control Tower inflate
//   • SALES-OS §8's mandatory remark is satisfied by words that contradict
//     the outcome they were attached to
//
// THIS IS A QUESTION, NOT A REJECTION, and the distinction is the whole
// design. "He didn't pick up my first call but rang back and said interested"
// is a legitimate connected outcome whose note contains "didn't pick up". A
// rule that blocked it would teach the reps to write shorter, emptier notes —
// destroying the remark history we shipped this morning to protect. So the
// rep is shown the contradiction and picks; either answer is one tap, and
// both are honest.
//
// We never rewrite their entry silently. The rep decides what happened; this
// module only notices that the two halves of their own entry disagree.

/**
 * Phrases that mean NOBODY ANSWERED, in the English and romanised Hinglish
 * the reps actually type. Drawn from production remarks, not invented:
 * "not pick", "not pickk", "not pick voice mail send", "cut the call",
 * "Didn't pick up the call".
 *
 * DELIBERATELY EXCLUDED — every one of these appeared in a genuine CONNECTED
 * call and must never trigger the question:
 *   • "busy"  — "the student is currently busy at the office and will be
 *     available after 7" is a real conversation with a real callback.
 *   • "not interested" / "no" — outcomes, not silence.
 *   • "call" alone — appears in almost every remark ever written.
 *
 * Matching is substring-on-lowercase and deliberately dumb. Negation parsing
 * ("did NOT fail to pick up") is where false confidence lives; because the
 * result is a question rather than a block, a false positive costs one tap
 * and a missed match costs only what we already have today.
 */
export const NO_ANSWER_PHRASES = [
  'not pick', 'notpick', 'not picking', 'not picked',
  'didnt pick', "didn't pick", 'did not pick', 'dint pick',
  'no pick', 'not recieved', 'not received', 'not answer', 'no answer',
  'not responding', 'no response', 'not reachable', 'unreachable',
  'switch off', 'switched off', 'switchoff',
  'voice mail', 'voicemail', 'cut the call', 'cut call', 'call cut',
  'ringing', 'rang out', 'no reply',
  // Romanised Hinglish, as typed. ASCII only — the English-only guard bans
  // Devanagari, and these are transliterations a rep types on an English
  // keyboard, not Hindi script.
  'nhi utha', 'nahi utha', 'nhi uthaya', 'phone nhi', 'call nhi', 'uthaya nhi',
] as const;

/** Does this remark say, in the rep's own words, that nobody answered? */
export function readsAsNoAnswer(note: string | null | undefined): boolean {
  if (!note) return false;
  // Collapse repeated letters typed in haste ("not pickk" -> "not pick") and
  // squeeze whitespace, so a slip of the finger does not defeat the check.
  const n = note.toLowerCase().replace(/(.)\1{2,}/g, '$1$1').replace(/\s+/g, ' ').trim();
  return NO_ANSWER_PHRASES.some((p) => n.includes(p));
}

/**
 * The contradiction: a CONNECTED outcome (someone spoke) whose remark says
 * nobody answered.
 *
 * `connectedOutcomes` is injected rather than imported so this module stays
 * pure and the vocabulary keeps exactly one home (lib/sales-disposition).
 */
export function contradictsConnectedOutcome(
  outcome: string,
  note: string | null | undefined,
  connectedOutcomes: readonly string[],
): boolean {
  return connectedOutcomes.includes(outcome) && readsAsNoAnswer(note);
}

/** The machine-readable code the API returns and the card switches on. */
export const NO_ANSWER_CONTRADICTION_CODE = 'no_answer_contradiction';

/** The question, phrased so neither answer is the "wrong" one. */
export function contradictionQuestion(outcomeLabel: string): string {
  return `Your note says they didn't answer, but you marked this as ${outcomeLabel}. Which one happened?`;
}
