import { dailyPickIndex } from '@/lib/community-pipeline';

// ── Daily Pick as a curiosity engine, not a voting screen ───────────────────
//
// Founder, 12 Aug 2026: "Only reason behind daily pick was to increase the
// engagement slowly" — and then, on the rotation idea: build it now.
//
// Today Daily Pick asks one question forever: judge another student's tip. On
// 12 Aug that produced twelve openers and zero votes. The diagnosis was never
// that voting is broken (the route and the pool were both verified healthy);
// it is that ONE kind of ask cannot carry a daily habit. A student who does not
// feel like judging a stranger's tip has nothing else there, so they leave, and
// tomorrow they have one fewer reason to come back.
//
// So the surface becomes a rotation. The job of the screen changes from
// "collect votes" to "be worth opening", which is the actual retention job.
//
// TWO RULES THAT ARE NOT NEGOTIABLE:
//
//  1. ONE thing per day. Not a feed. Founder's own framing, and it is right:
//     the student must still leave thinking "I prepared today", not "I consumed
//     CAT content for 40 minutes". Scarcity is doing work here — an infinite
//     scroll would raise session length and destroy the product. Bounded by
//     construction: this function returns exactly one kind.
//
//  2. NEVER render an empty pick. A kind is only eligible if the caller has
//     confirmed it can actually be filled with something TRUE for this student
//     today. An engine that picks "here's a fact about your preparation" for a
//     student with no preparation data has to invent one, and inventing is the
//     one thing forbidden everywhere in this codebase (Trust OS §2.1,
//     Incident #7). Availability is an input, never an assumption.

export type PickKind =
  /** Solve one real CAT question. The Duolingo lesson equivalent. */
  | 'question'
  /** Judge a peer's tip — the surface as it exists today. */
  | 'community'
  /** Something true about THIS student's own preparation. */
  | 'mirror'
  /** What students like them are doing. Belonging, not comparison. */
  | 'peer'
  /** One prompt worth thinking about for ten seconds. */
  | 'reflection';

/**
 * The rotation weights.
 *
 * Founder's shape (40 learning / 20 curiosity / 15 community / 15 expertise /
 * 10 reflection), mapped onto the kinds that can actually be built from data we
 * hold today. Learning stays dominant because the student came here to prepare,
 * and a curiosity engine that stops being a study app has lost the plot.
 *
 * These are relative weights, not percentages — they are renormalised over
 * whatever is actually available, so removing a kind never leaves a dead slot.
 */
export const PICK_WEIGHTS: Record<PickKind, number> = {
  question: 40,
  mirror: 20,
  community: 15,
  peer: 15,
  reflection: 10,
};

export interface PickAvailability {
  /** A real, unanswered question exists for this student. */
  question: boolean;
  /** The voting pool has something they have not seen. */
  community: boolean;
  /** We hold enough of their own data to say something true about it. */
  mirror: boolean;
  /** A peer cohort large enough to speak about (see peer-cohort.ts). */
  peer: boolean;
  /** Always true — a reflection prompt needs nothing but the student. */
  reflection: boolean;
}

export const ALL_KINDS: PickKind[] = ['question', 'mirror', 'community', 'peer', 'reflection'];

/**
 * Which kind of pick this student gets today.
 *
 * Deterministic on (student, day): the same student asking twice in one day
 * gets the same answer, so a refresh cannot reroll the day into something more
 * appealing — that is the Incident #28 failure (a day re-rolled underneath the
 * student who was holding it) in miniature, and the fix is the same one:
 * decide from a hash of who and when, never from chance.
 *
 * Returns null only when nothing at all is available, which the caller must
 * render as a quiet, honest empty state rather than a placeholder.
 */
export function pickKindForDay(
  studentId: string,
  dayIso: string,
  available: PickAvailability,
  recentKinds: PickKind[] = [],
): PickKind | null {
  const eligible = ALL_KINDS.filter((k) => available[k]);
  if (eligible.length === 0) return null;
  if (eligible.length === 1) return eligible[0];

  // Don't serve the same kind three days running. A rotation that repeats is
  // just the old single-surface problem with extra steps — and the whole reason
  // this engine exists is that one repeated ask stops being worth opening.
  const lastTwo = recentKinds.slice(-2);
  const repeated = lastTwo.length === 2 && lastTwo[0] === lastTwo[1] ? lastTwo[0] : null;
  const candidates = repeated && eligible.some((k) => k !== repeated)
    ? eligible.filter((k) => k !== repeated)
    : eligible;

  const deck = weightedDeck(candidates);
  if (deck.length === 0) return candidates[0];
  return deck[dailyPickIndex(`${studentId}:kind`, dayIso, deck.length)];
}

/**
 * A deck of `total` slots holding each kind in proportion to its weight, with
 * the copies SPREAD rather than blocked.
 *
 * This interleaving is load-bearing, not tidiness. dailyPickIndex is a rolling
 * hash of student+date, so two consecutive dates hash to two nearly consecutive
 * numbers — the low bits barely move. Against a blocked deck
 * (QQQQ…MMMM…CCCC…) that means index+1 per day, which lands in the SAME kind
 * for as long as that kind's block is wide: a student would have drawn
 * "question" roughly forty days running. The first draft did exactly that, and
 * the rotation test caught it — which is the whole point of asserting that the
 * surface changes across days rather than only that the maths is right.
 *
 * Spreading the copies (question at slots 0, 2, 5, 7 … rather than 0–39) makes
 * adjacent slots different kinds, so +1 per day is a genuinely different ask,
 * while the population-level distribution still matches the weights exactly.
 *
 * Positions come from the standard low-discrepancy rule (j + ½) / weight, and
 * ties break on the kind's fixed order so the deck is byte-identical on every
 * call and every machine.
 */
function weightedDeck(kinds: PickKind[]): PickKind[] {
  const slots: { at: number; order: number; kind: PickKind }[] = [];
  for (const kind of kinds) {
    const w = PICK_WEIGHTS[kind];
    const order = ALL_KINDS.indexOf(kind);
    for (let j = 0; j < w; j++) slots.push({ at: (j + 0.5) / w, order, kind });
  }
  slots.sort((a, b) => a.at - b.at || a.order - b.order);
  return slots.map((s) => s.kind);
}

// ── Reflection prompts ──────────────────────────────────────────────────────
//
// The cheapest kind to build and the only one that is always available, so it
// is the floor the rotation can never fall through.
//
// Every prompt is answerable in one sentence by a student having a bad week.
// Nothing here asks them to justify themselves, rank themselves, or predict
// their score — a reflection that feels like an exam is not a reflection.

export const REFLECTION_PROMPTS: string[] = [
  'What is the one topic you keep postponing? Name it — that is usually the whole diagnosis.',
  'When you sat down to study this week, what actually made it start? Copy that tomorrow.',
  'What is something you understood this week that you did not understand last week?',
  'If you had only one hour today, which section would you spend it on, and why that one?',
  'What is the last thing that made you feel like you were getting better at this?',
  'Which part of your plan are you quietly ignoring? There is usually a reason worth knowing.',
  'What would make tomorrow morning easier for the version of you who wakes up?',
  'What is one thing about your preparation you would tell a student starting today?',
];

/** Today's prompt for this student — stable for the day, same primitive. */
export function reflectionForDay(studentId: string, dayIso: string): string {
  return REFLECTION_PROMPTS[dailyPickIndex(`${studentId}:reflect`, dayIso, REFLECTION_PROMPTS.length)];
}

/** Human label for the slot, so the screen names what it is offering. */
export const KIND_LABEL: Record<PickKind, string> = {
  question: "Today's question",
  mirror: 'Something we noticed',
  community: 'From another student',
  peer: 'Students like you',
  reflection: 'Worth thinking about',
};
