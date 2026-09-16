// ── STUDENT OUTREACH: the founder asks, by hand, one student at a time ──────
//
// Founder, 16 Sep 2026: every student who logged in the last three weeks gets
// a personal WhatsApp from him asking for ONE suggestion, strength or
// weakness. Raw and honest feedback, in his words.
//
// This is NOT log-breakers. That list is "you stopped — why?", and it only
// contains students who already went quiet. This one includes students who are
// STILL logging, because the person mid-streak is the one who can tell you
// what is working, and nobody has ever asked them.
//
// THREE RULES, all from the founder and all load-bearing:
//
//   1. TWO LINES. Not five, not ten. A student reading a paragraph from a
//      stranger on WhatsApp does not reply; a student reading two blunt lines
//      sometimes does.
//   2. NOT FUNNY, NOT CLEVER, NO SELLING. "Simple sa, blunt sa." The ask is
//      the whole message.
//   3. IT MUST READ LIKE HE OPENED THEIR PROFILE. A student who logged three
//      days and a student who logged fourteen should not receive the same
//      sentence. The number in the message is what makes it personal, which
//      is exactly why every number here must be TRUE — see below.
//
// NOTHING HERE SENDS ANYTHING. It composes a draft; the founder taps send.
// That is deliberate and should stay that way: the moment this can auto-send,
// a wrong number in a draft becomes a wrong claim delivered at scale.

/** One student who logged recently, with the facts a message may cite. */
export interface OutreachRow {
  studentId: string;
  name: string;
  phone: string | null;
  /** Distinct days this student has EVER logged. */
  logDays: number;
  /** Live streak today — 0 once it breaks. Never the stored counter. */
  liveStreak: number;
  /** Longest chain they ever built. */
  longestStreak: number;
  /** ISO date of the most recent log. */
  lastLog: string;
  daysSinceLastLog: number;
}

export type OutreachState =
  | 'logging_strong'  // live streak 7+ — a real habit, ask what is working
  | 'logging'         // live streak 2-6
  | 'logging_new'     // live streak 1 — just started
  | 'streak_broken'   // built a chain of 3+, now dead
  | 'stopped'         // logged more than once, no real chain, now quiet
  | 'one_and_done';   // exactly one log, ever

export function outreachState(r: OutreachRow): OutreachState {
  // Live first: a student logging TODAY is never "stopped", whatever their
  // history says. Getting this order wrong would send "you stopped" to
  // somebody who logged an hour ago, which ends the conversation instantly.
  if (r.liveStreak >= 7) return 'logging_strong';
  if (r.liveStreak >= 2) return 'logging';
  if (r.liveStreak === 1) return 'logging_new';
  if (r.logDays === 1) return 'one_and_done';
  if (r.longestStreak >= 3) return 'streak_broken';
  return 'stopped';
}

/** "Aryan Lalwani" → "Aryan". Falls back to a greeting, never to "(no name)". */
export function firstNameOf(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? '';
  // A literal "(no name)" placeholder in a WhatsApp message is worse than no
  // name at all — it tells the student they are a row in a database.
  if (!first || first.startsWith('(')) return 'there';
  return first;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The draft. Two lines: one personal observation, one ask.
 *
 * Every number cited here is read from this student's own rows. That is the
 * whole point — and it is also the risk, because a message that says "you
 * logged 5 days straight" to somebody who logged three is worse than a generic
 * message: it proves nobody looked. The states above are ordered so that the
 * number quoted always matches the state that quoted it.
 */
export function outreachDraft(r: OutreachRow): string {
  const who = firstNameOf(r.name);
  const me = `Hi ${who}, Nishant here, founder of CareerRai.`;
  const ask = 'Thanks a lot.';

  switch (outreachState(r)) {
    case 'logging_strong':
      return `${me} You've logged ${plural(r.liveStreak, 'day')} straight — that's rare, so I want to learn from you. `
        + `One suggestion, strength or weakness of CareerRai? ${ask}`;

    case 'logging':
      return `${me} You're ${plural(r.liveStreak, 'day')} into logging your prep. `
        + `One ask — any one suggestion, strength or weakness of CareerRai? Tell me straight. ${ask}`;

    case 'logging_new':
      return `${me} You just started logging your prep. `
        + `One quick ask — any one suggestion, strength or weakness of CareerRai? Tell me straight. ${ask}`;

    case 'streak_broken':
      return `${me} You logged ${plural(r.longestStreak, 'day')} straight and then stopped ${plural(r.daysSinceLastLog, 'day')} ago — was something missing? `
        + `One suggestion, strength or weakness of CareerRai, tell me straight. ${ask}`;

    case 'one_and_done':
      return `${me} You logged your prep once and didn't come back — what put you off? `
        + `One suggestion or weakness of CareerRai, tell me straight. ${ask}`;

    case 'stopped':
    default:
      return `${me} You logged ${plural(r.logDays, 'day')} and then stopped — any reason? `
        + `One suggestion, strength or weakness of CareerRai, tell me straight. ${ask}`;
  }
}

/** Human label for the board's grouping. */
export const STATE_LABEL: Record<OutreachState, string> = {
  logging_strong: 'Logging 7+ days straight',
  logging: 'Logging now',
  logging_new: 'Just started',
  streak_broken: 'Streak broke',
  stopped: 'Logged, then stopped',
  one_and_done: 'Logged once only',
};

/**
 * Board order: the people whose answer is worth most, first.
 *
 * Long streaks lead because they can say what WORKS, and no other list in the
 * product ever asks them. Broken streaks next — they got far enough to have a
 * specific reason for leaving. One-and-done last: the largest group (189 of
 * 332 students who ever logged, measured 16 Sep) but the vaguest answers, and
 * a founder with limited hours should not spend them there first.
 */
export const STATE_ORDER: readonly OutreachState[] = [
  'logging_strong', 'logging', 'streak_broken', 'logging_new', 'stopped', 'one_and_done',
];
