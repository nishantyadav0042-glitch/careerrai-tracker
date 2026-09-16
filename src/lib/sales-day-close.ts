// ── THE DAY-CLOSE CARD — what a counsellor sends the founder at shift end ───
//
// Founder, 15 Sep 2026, translated from Hindi: "when you close for the day,
// send me a summary at night — how many calls you made, how many you did not,
// what the students said, four or five pointers." One screen a rep
// screenshots and sends.
//
// WHY THIS IS NOT A SCOREBOARD, AND MUST NEVER BECOME ONE. SALES-OS §0: a
// telemetry number "may never appear as a performance judgement, a target, a
// quota, or an input to pay." So the card is ordered by what a conversation
// PRODUCED, and the raw attempt count sits underneath as context — never at
// the top, never as a headline, never compared between the two reps. A card
// that opened with "112 calls" would teach both of them to make 113.
//
// WHAT IT REFUSES TO HIDE. SALES-OS §5: "a day the book cannot fill is
// reported short, never padded." The unfinished half of the day is on the card
// with the same weight as the finished half — cards left open, and promises
// that came due today and were not kept. A summary a rep can send while 67
// cards sit untouched is a summary that lies by omission, and the founder
// would be reading it as if it were the day.
//
// EVIDENCE CLASS. Every number here is self_reported: a row a rep chose to
// write. The system has no telephony record, and the card says so in the
// footer rather than letting a screenshot travel as if it were observed fact.

import type { DaySnapshot } from '@/lib/sales-yesterday';
import { CONNECTED_OUTCOMES } from '@/lib/sales-disposition';

/** A student's own words, with who said them. The founder asked for this by
 *  name — "what the student said" — and it is the one part of the day that
 *  cannot be produced without having had the conversation. */
export interface StudentVoice {
  studentId: string;
  studentName: string;
  outcome: string;
  words: string;
}

export interface DayClose {
  repName: string;
  label: string;              // IST date, YYYY-MM-DD
  /** P0 first: what the day produced. */
  connected: number;          // conversations that actually happened
  interested: number;         // the only pipeline number that matters
  callbacksSet: number;       // promises taken from us today
  voices: StudentVoice[];     // what students said, in their words
  /** The unfinished half — never omitted. */
  cardsGiven: number;
  cardsLeftOpen: number;
  /** null = the promise ledger could not be read. NEVER collapse to 0: a
   *  failed read that prints "nothing outstanding" is the comfortable lie
   *  this whole card exists to refuse. */
  promisesDueUnkept: number | null;
  /** Context, deliberately last. */
  attempts: number;
  noAnswer: number;
  messaged: number;
  studentsTouched: number;
}

const CONNECTED = new Set<string>(CONNECTED_OUTCOMES);

/** Did this row represent a human conversation? */
export function isConversation(status: string): boolean {
  return CONNECTED.has(status);
}

/**
 * Assemble the card.
 *
 * Pure: every input is already fetched, so the shape of the day has one
 * definition and the page stays responsible for the queries. It also means the
 * rep's card and any founder-side view of the same day are the same function.
 */
export function buildDayClose(args: {
  repName: string;
  snapshot: DaySnapshot;
  voices: StudentVoice[];
  cardsGiven: number;
  cardsWorked: number;
  promisesDueUnkept: number | null;
  maxVoices?: number;
}): DayClose {
  const { snapshot: s } = args;
  const by = s.byOutcome;
  const connected = Object.entries(by)
    .filter(([status]) => isConversation(status))
    .reduce((n, [, v]) => n + v, 0);

  return {
    repName: args.repName,
    label: s.label,
    connected,
    interested: by.interested ?? 0,
    callbacksSet: s.callbacksSet,
    // Newest first is already the caller's order; we only cap. Five is the
    // founder's own "four or five pointers" — a card that scrolls is a card that
    // does not survive a screenshot.
    voices: args.voices.slice(0, args.maxVoices ?? 5),
    cardsGiven: args.cardsGiven,
    cardsLeftOpen: Math.max(0, args.cardsGiven - args.cardsWorked),
    promisesDueUnkept: args.promisesDueUnkept,
    attempts: s.attempts,
    noAnswer: by.no_answer ?? 0,
    messaged: by.messaged ?? 0,
    studentsTouched: s.studentsTouched,
  };
}

/**
 * The one line the founder reads first in the screenshot.
 *
 * Says what the day PRODUCED, and says it plainly when the answer is nothing —
 * "6 calls, nobody picked up" is a real day and an honest sentence. A card
 * that dressed that up would be worse than no card.
 */
export function headline(d: DayClose): string {
  if (d.attempts === 0) return 'No calls logged today.';
  if (d.connected === 0) {
    return `${d.attempts} attempt${d.attempts === 1 ? '' : 's'} — nobody picked up today.`;
  }
  const parts = [`${d.connected} conversation${d.connected === 1 ? '' : 's'}`];
  if (d.interested > 0) parts.push(`${d.interested} interested`);
  if (d.callbacksSet > 0) parts.push(`${d.callbacksSet} callback${d.callbacksSet === 1 ? '' : 's'} promised`);
  return parts.join(' · ');
}

/**
 * What the rep still owes, as a sentence — empty when the day really is clean.
 *
 * Deliberately returns '' rather than a cheerful line, so the card can drop
 * the whole block. A green "all done!" banner on a finished day is noise; its
 * absence is the signal.
 */
export function owed(d: DayClose): string {
  const bits: string[] = [];
  if (d.cardsLeftOpen > 0) bits.push(`${d.cardsLeftOpen} of ${d.cardsGiven} cards still open`);
  if (d.promisesDueUnkept === null) {
    bits.push('could not check promised callbacks');
  } else if (d.promisesDueUnkept > 0) {
    bits.push(`${d.promisesDueUnkept} promised callback${d.promisesDueUnkept === 1 ? '' : 's'} not kept`);
  }
  return bits.join(' · ');
}
