// ── The beat between answering and being taught ─────────────────────────────
//
// Founder, 13 Aug: "Don't always immediately give the explanation. Give the
// student a tiny emotional reaction first. The question is content. The reveal
// is entertainment."
//
// He is right, and the bat-and-ball question is the proof. A student who
// answers ₹10 and is immediately handed algebra feels corrected. A student who
// first reads "you're in very good company" and THEN gets the algebra feels
// let in on something. Same information, opposite feeling, and the second one
// is the one that comes back tomorrow.
//
// Deliberately NOT a database column. These lines are about the ANSWER, not
// about the question, so they need no per-item authoring and no migration —
// which also means a new question is never blocked on someone writing its
// reaction copy.
//
// Two rules the wording obeys:
//   · Getting it wrong is never framed as a failure. The whole product exists
//     for students who are already anxious; "Wrong." is a word we do not use.
//   · Getting it right is acknowledged without inflation. "Genius!" for a
//     60-second question is flattery, and students can smell it.

/** Rotates so a student answering daily does not read the same line twice. */
const RIGHT = [
  'You saw it.',
  'That is the one most people miss.',
  'Caught it.',
  'You did not fall for it.',
  'Clean.',
];

const WRONG = [
  'You are in very good company.',
  'Almost everyone says that first.',
  'That is the answer the question is designed to pull you toward.',
  'Good instinct — wrong question.',
  'This one catches nearly everybody.',
];

/**
 * The line shown BEFORE the explanation.
 *
 * `seed` keeps it stable for a given attempt (the challenge id works well), so
 * a re-render never swaps the sentence under the student mid-read.
 */
export function reactionLine(isCorrect: boolean, seed: string): string {
  const pool = isCorrect ? RIGHT : WRONG;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return pool[h % pool.length];
}

/** Every line, for the guard test that checks the tone of all of them. */
export const ALL_REACTIONS = [...RIGHT, ...WRONG];
