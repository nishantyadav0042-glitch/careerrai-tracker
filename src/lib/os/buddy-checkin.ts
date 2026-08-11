// ── Buddy check-in: the mentor notices before the student disappears ────────
//
// Founder, 10 Aug: "Agar mere paas 5 student assigned hain aur unme se kisi ek
// ne bhi kal log nahi bhara, to agle din uski buddy ki ID se message jaayega —
// bhai tumne kal log kyun nahi bhara, padhai sahi chal rahi hai?"
//
// The point is NOT the reminder. The 8 AM log-yesterday push already reminds.
// The point is that a *person the student knows* noticed. That only works if
// three things are true, and this module exists to keep them true:
//
//  1. The mentor actually knows the message went out. A message from Shreya's
//     ID that Shreya has never seen is a trap: the student replies, nobody
//     answers, and the "your mentor is watching" promise becomes a lie. So the
//     cron only DRAFTS; the mentor sends with one tap (founder's choice).
//  2. The message uses what we already know about this student — the broken
//     streak, the mock they just took, the blocker they typed last week. A
//     generic line is a template, and students recognise templates.
//  3. It is rare. Cooldown, an unanswered-stop, and a TTL are all here so the
//     personal feel survives contact with a cron.
//
// Everything in this file is pure. The cron decides WHO, this decides WHETHER
// and WHAT.

import {
  CHECKIN_MISSED_DAYS_TRIGGER,
  CHECKIN_MAX_MISSED_DAYS,
  CHECKIN_COOLDOWN_DAYS,
  CHECKIN_MAX_UNANSWERED,
} from './scale-config';

export type CheckInSignal =
  | 'streak_broken'
  | 'after_mock'
  | 'blocker'
  | 'section_cold'
  | 'silent';

export interface CheckInFacts {
  /** First name only — this reads as a person talking, not a CRM. */
  firstName: string;
  /** Consecutive days with no log at all, counted back from yesterday. */
  missedDays: number;
  /** Streak the student was carrying when the silence started. */
  streakAtBreak: number;
  /** Did their last log record a mock? */
  lastLogHadMock: boolean;
  lastMockName: string | null;
  /** blocker_reason from their last log, verbatim student text. */
  lastBlocker: string | null;
  /** Weakest/priority section they have not touched, and for how long. */
  coldSection: { section: string; days: number } | null;
}

export interface CheckInDraft {
  signal: CheckInSignal;
  body: string;
  /** Why this line was written — shown to the mentor above the draft, and kept
   *  on the row so a message from a mentor's ID is never unexplainable later. */
  evidence: Record<string, unknown>;
}

/** A streak has to be worth mourning before we mention it. */
const STREAK_WORTH_MENTIONING = 5;
/** A section is "cold" only after this long untouched. */
const SECTION_COLD_DAYS = 5;
/** Student-typed text is quoted back to them — bound it and flatten it. */
const QUOTE_MAX = 90;

/**
 * Consecutive logless days ending yesterday.
 *
 * Rest days count as logs. That is deliberate and load-bearing: the founder
 * removed "studied / not studied" from the log precisely so that showing up and
 * saying "aaj rest" IS participation. A student who logs a rest day has not
 * gone quiet, and must never get a "where are you" message.
 *
 * `logDates` are log-day strings (YYYY-MM-DD, 3 AM IST boundary); `today` is
 * the current log-day. Counting starts at yesterday because today is still open
 * — nobody is late until their day has closed.
 */
export function consecutiveMissedDays(logDates: Iterable<string>, today: string): number {
  const logged = new Set(logDates);
  let missed = 0;
  let cursor = Date.parse(`${today}T00:00:00Z`) - 86_400_000; // start at yesterday
  // A hard stop: past ~30 days this is not a check-in case, it is churn, and
  // the exact number stops mattering.
  while (missed < 30) {
    const day = new Date(cursor).toISOString().slice(0, 10);
    if (logged.has(day)) break;
    missed++;
    cursor -= 86_400_000;
  }
  return missed;
}

export interface EligibilityInput {
  missedDays: number;
  /** When this student was last actually sent a check-in (ISO), if ever. */
  lastCheckInSentAt: string | null;
  /** Consecutive sent check-ins the student never replied to. */
  unansweredCheckIns: number;
  /** A draft is already waiting on the mentor's screen. */
  hasOpenDraft: boolean;
  now: Date;
}

export type EligibilityReason =
  | 'eligible'
  | 'still_logging'
  | 'long_gone'
  | 'draft_pending'
  | 'unanswered_stop'
  | 'cooldown';

/**
 * Whether to draft a check-in for this student today.
 *
 * The order matters. `unanswered_stop` is checked before `cooldown` so a
 * student who has ignored two personal messages reports the honest reason
 * rather than the incidental one — that distinction is what tells the mentor
 * "stop typing, pick up the phone".
 */
export function checkInEligibility(input: EligibilityInput): {
  eligible: boolean;
  reason: EligibilityReason;
} {
  if (input.missedDays < CHECKIN_MISSED_DAYS_TRIGGER) {
    return { eligible: false, reason: 'still_logging' };
  }
  // Measured against live data on 10 Aug: two assigned accounts were 13 and 31
  // days silent. Drafting "31 din se log nahi dikha, sab theek hai?" for a
  // mentor to send is not a check-in — it is a month-late condolence, and it
  // would be the most conspicuous message in the thread.
  if (input.missedDays > CHECKIN_MAX_MISSED_DAYS) {
    return { eligible: false, reason: 'long_gone' };
  }
  if (input.hasOpenDraft) return { eligible: false, reason: 'draft_pending' };
  if (input.unansweredCheckIns >= CHECKIN_MAX_UNANSWERED) {
    return { eligible: false, reason: 'unanswered_stop' };
  }
  if (input.lastCheckInSentAt) {
    const days = (input.now.getTime() - Date.parse(input.lastCheckInSentAt)) / 86_400_000;
    if (days < CHECKIN_COOLDOWN_DAYS) return { eligible: false, reason: 'cooldown' };
  }
  return { eligible: true, reason: 'eligible' };
}

/** Student-written text, made safe to quote inside a mentor's message. */
function quote(raw: string): string {
  const flat = raw.replace(/\s+/g, ' ').trim();
  return flat.length > QUOTE_MAX ? `${flat.slice(0, QUOTE_MAX - 1)}…` : flat;
}

const dayWord = (n: number) => (n === 1 ? '1 din' : `${n} din`);

/**
 * Write the draft.
 *
 * Tone rule (founder, 10 Aug — "keep the language good, not rude"): every line
 * is on the student's side. We never ask "kyun nahi bhara" as an accusation, we
 * never imply they are stuck or failing, and we always end with an offer —
 * adjust the plan, look at it together, just reply one line. A mentor's message
 * that makes a student feel caught is worse than no message: it makes them
 * avoid the app instead of opening it.
 *
 * The mentor can edit every word before sending. This is a first draft written
 * by someone who has read the student's data — not a script.
 */
export function buildCheckInDraft(facts: CheckInFacts): CheckInDraft {
  const name = facts.firstName.trim() || 'Hi';
  const gap = dayWord(facts.missedDays);

  // Strongest signal wins. Order = how much it proves we were paying attention.
  if (facts.streakAtBreak >= STREAK_WORTH_MENTIONING) {
    return {
      signal: 'streak_broken',
      body:
        `${name}, tumne ${dayWord(facts.streakAtBreak)} ka streak banaya tha — ${gap} se log nahi dikha. ` +
        `Sab theek hai na? Streak wapas ban jaata hai, tension mat lo. Bas ek line bata do kya chal raha hai.`,
      evidence: { streakAtBreak: facts.streakAtBreak, missedDays: facts.missedDays },
    };
  }

  if (facts.lastLogHadMock) {
    const mock = facts.lastMockName?.trim() ? quote(facts.lastMockName) : 'mock';
    return {
      signal: 'after_mock',
      body:
        `${name}, ${mock} ke baad se tumhara log nahi aaya (${gap}). ` +
        `Mock ke baad thoda break lena normal hai. Score par baat karni ho to bata do, saath me dekh lete hain.`,
      evidence: { lastMockName: facts.lastMockName, missedDays: facts.missedDays },
    };
  }

  if (facts.lastBlocker?.trim()) {
    return {
      signal: 'blocker',
      body:
        `${name}, pichhle log me tumne likha tha: "${quote(facts.lastBlocker)}". ` +
        `Uske baad ${gap} se log nahi dikha. Agar wahi cheez abhi tak chal rahi hai to batao — plan usi hisaab se adjust kar dete hain.`,
      evidence: { lastBlocker: quote(facts.lastBlocker), missedDays: facts.missedDays },
    };
  }

  if (facts.coldSection && facts.coldSection.days >= SECTION_COLD_DAYS) {
    const { section, days } = facts.coldSection;
    return {
      signal: 'section_cold',
      body:
        `${name}, ${gap} se log nahi dikha aur ${section} ko bhi ${dayWord(days)} ho gaye. ` +
        `Koi baat nahi — batao kya chal raha hai, zaroorat ho to plan halka kar dete hain.`,
      evidence: { section, coldDays: days, missedDays: facts.missedDays },
    };
  }

  return {
    signal: 'silent',
    body:
      `${name}, ${gap} se tumhara log nahi dikha. Busy ho ya kuch aur chal raha hai? ` +
      `Ek line reply kar do — plan tumhare hisaab se adjust kar dete hain.`,
    evidence: { missedDays: facts.missedDays },
  };
}

/**
 * The one line shown to the MENTOR above the draft: why this student surfaced
 * and why the message says what it says.
 *
 * A mentor about to send something under their own name is entitled to know
 * what it was built from. Without this the card is "trust the machine", which
 * is exactly the posture that gets a mentor to send something they would not
 * have written — and then be unable to explain it when the student asks.
 */
export function checkInBecause(signal: CheckInSignal, evidence: Record<string, unknown>): string {
  switch (signal) {
    case 'streak_broken':
      return `Was on a ${evidence.streakAtBreak}-day streak before going quiet`;
    case 'after_mock':
      return evidence.lastMockName
        ? `Went quiet right after ${evidence.lastMockName}`
        : 'Went quiet right after a mock';
    case 'blocker':
      return `Last log mentioned: "${evidence.lastBlocker}"`;
    case 'section_cold':
      return `${evidence.section} untouched for ${evidence.coldDays} days`;
    default:
      return 'No log, no other signal — a plain check-in';
  }
}
