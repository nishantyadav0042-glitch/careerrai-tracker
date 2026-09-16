import type { DueReason } from '@/lib/call-queue';

// ── LET A COUNSELLOR CUT HER OWN DAY (Neelam, 16 Sep 2026) ──────────────────
//
// Her words, on WhatsApp: *"mai msg krti hu to vhi total no. count hote h ese
// me to mai confused ho re hu ki kitni call ki h kitni nhi"* and *"agar vha pr
// not pick walo pr ya switch off pr filter lga skti to or ache se hota"*.
//
// Two separate defects in one message, and she found both:
//
//   1. The deck's tally counted every marked card as one thing. A message and
//      a skip incremented the same number as a call, so a counsellor working
//      to a call figure could not tell what she had actually done. She capped
//      herself at 40 that morning because she could not see her own day.
//   2. Seventy cards arrive as one list. To find the ones who had not picked
//      up she had to read all seventy, every time.
//
// Both are ours, not hers.
//
// The filters below cut ACROSS the day's sections rather than repeating them —
// the deck already groups by promises / money / new / attention / rotation, so
// a filter that re-cut the same way would be decoration. These cut by what the
// REP recorded and what the card is asking her to do, which is the axis the
// sections cannot show.
//
// NOT BUILT, deliberately: a target, a quota, or a progress bar toward one.
// SALES-OS §0 — a P5 number may never appear as a performance judgement, a
// target, or an input to pay. "At least 40 daily" is the founder's instruction
// to a person; putting 40 on her screen would make the product enforce it, and
// that is a different thing from letting her see her own work. She asked to
// SEE, so she is shown counts and nothing else.

export const DECK_FILTERS = ['all', 'to_call', 'to_message', 'no_answer', 'never_called'] as const;
export type DeckFilter = (typeof DECK_FILTERS)[number];

/**
 * Plain words a counsellor reads at speed, in her own framing.
 *
 * "Didn't pick up" rather than "no answer": she asked for *"not pick walo"*,
 * and the deck is read in a hurry between dials.
 */
export const DECK_FILTER_LABEL: Record<DeckFilter, string> = {
  all: 'All',
  to_call: 'To call',
  to_message: 'To message',
  no_answer: "Didn't pick up",
  never_called: 'Never called',
};

/** Only what the filter needs, so the pure core can be driven without a DB. */
export interface FilterableLead {
  channel: 'call' | 'message';
  /** Consecutive unanswered dials already recorded against this student. */
  noAnswerCount: number;
  dueReason: DueReason;
}

export function matchesDeckFilter(lead: FilterableLead, filter: DeckFilter): boolean {
  switch (filter) {
    case 'all': return true;
    case 'to_call': return lead.channel === 'call';
    case 'to_message': return lead.channel === 'message';
    // What she actually asked for: the ones who did not answer. Counted from
    // the dials ALREADY RECORDED, never from the lane — `retry` is a lane the
    // queue assigns and can expire, while an unanswered dial is a fact about
    // the student that stays true whatever lane they land in tomorrow.
    case 'no_answer': return lead.noAnswerCount > 0;
    // Nobody at CareerRai has ever spoken to them. The one group where a
    // filter changes what she says when the call connects.
    case 'never_called': return lead.dueReason === 'fresh';
  }
}

/** How many cards each chip would show, so a chip never lies about its size. */
export function deckFilterCounts(leads: readonly FilterableLead[]): Record<DeckFilter, number> {
  const out = {} as Record<DeckFilter, number>;
  for (const f of DECK_FILTERS) out[f] = leads.filter((l) => matchesDeckFilter(l, f)).length;
  return out;
}

// ── THE SESSION TALLY, SPLIT (Neelam, 16 Sep 2026) ──────────────────────────

export interface SessionTally {
  /** Dials she made — connected or not. A ring that nobody answered is work. */
  called: number;
  /** WhatsApp messages sent. A touch, and counted, but not a call. */
  messaged: number;
  /** Cards closed without acting. Never a contact (lib/sales-disposition). */
  skipped: number;
}

export const EMPTY_TALLY: SessionTally = { called: 0, messaged: 0, skipped: 0 };

/**
 * Add one marked card to the tally.
 *
 * `no_answer` counts as a CALL, and that is the load-bearing decision here:
 * she picked up the phone and dialled, and a day spent on numbers that rang
 * out is a day of work. Counting only connected calls would tell a counsellor
 * that her hardest hours did not happen.
 *
 * A SKIP is counted apart from both, because a skip is explicitly not a
 * contact — it writes no lead state and starts no clock — and folding it into
 * either number would let a day of skipping read as a day of calling.
 */
export function addToTally(t: SessionTally, outcome: string): SessionTally {
  if (outcome === 'skipped') return { ...t, skipped: t.skipped + 1 };
  if (outcome === 'messaged') return { ...t, messaged: t.messaged + 1 };
  return { ...t, called: t.called + 1 };
}

/** The line she reads. Names only what happened — never a target. */
export function tallyLine(t: SessionTally): string {
  const parts = [`${t.called} called`, `${t.messaged} messaged`];
  if (t.skipped > 0) parts.push(`${t.skipped} skipped`);
  return parts.join(' · ');
}
