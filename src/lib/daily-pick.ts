// ── Daily Pick rotation ─────────────────────────────────────────────────────
//
// Founder spec, 29 Jul, replacing the graduation-bar model:
//
//   "Don't set a bar. Maximum votes gets the top position, but for max 1 day,
//    and the next day the question changes. If no voting, the one you'd have
//    kept in the pipeline moves to the top."
//
// WHY THE BARS WENT. The old model needed 5 votes before it would judge an
// item, then 85% helpful to feature it. Against the real pool — 28 items, 30
// votes, 2.0 votes per voted item, an 83% baseline helpful rate — that maths
// could never converge: nothing had EVER been featured, and 13 of 28 items had
// never received a single vote. A bar that no item can clear is not a quality
// filter, it is an off switch.
//
// THE NEW RULE, in full:
//   1. No threshold. Ever. Votes only ORDER the queue, they never gate it.
//   2. Exactly one item per kind holds the top slot on any given day.
//   3. An item holds it for ONE day and then steps aside — featured_on is a
//      single date, and the picker only ever considers items that have never
//      held the slot, so nothing can repeat while fresh stock exists.
//   4. Zero votes is not a blocker. With an empty scoreboard the queue order
//      decides, oldest first, so the shelf still turns over every day.
//   5. The shelf cannot run dry: once every item has had its day, the one that
//      held the slot longest ago comes back round.
//
// Deterministic on purpose — same inputs, same pick. The cron and the lazy path
// can both run it, twice in a minute if they like, and agree.

import { wilsonLower } from './pick-quality';

export type PickKind = 'question' | 'tip';

export interface PickCandidate {
  id: string;
  kind: PickKind;
  /** Total votes cast on this item. Helpful/not-helpful are NOT separated: the
   *  founder's rule is "maximum votes", and at an 83% helpful baseline the
   *  split carries almost no signal anyway. Attention is the ranking. */
  votes: number;
  /** ISO timestamp. The queue order, and the tie-break when votes are equal. */
  createdAt: string;
  /** The date this item last held the top slot, or null if it never has. */
  featuredOn: string | null;
  /**
   * Helpful votes only. Optional so existing callers/tests keep compiling;
   * when absent, every vote is treated as helpful — the old behaviour.
   */
  helpful?: number;
}

export type PickReason =
  | 'by_votes'     // fresh stock, and the leader had at least one vote
  | 'queue_order'  // fresh stock, but nobody has voted — oldest goes up
  | 'recycled'     // every item has had its day; longest-ago returns
  | 'none';        // no items of this kind exist at all

export interface KindPick {
  id: string | null;
  reason: PickReason;
  votes: number;
}

/**
 * Ordering: best-evidenced quality first, then oldest first.
 *
 * QUALITY, not raw count (13 Aug). The old rule ranked by total votes, which
 * counted a "not useful" vote identically to a "helpful" one — ten downvotes
 * outranked three upvotes, so the surest way to the top slot was to be
 * voted on a lot, not to be good. The Wilson lower bound (lib/pick-quality)
 * fixes both failures at once: downvotes now push an item DOWN, and a
 * 3-vote-perfect newcomer cannot leapfrog a 500-vote 91% veteran.
 *
 * Oldest-first stays as the tie-break — the fairness rule. With most items
 * unvoted (score 0), it still decides nearly every pick, exactly as before.
 */
function byQualityThenOldest(a: PickCandidate, b: PickCandidate): number {
  const qa = wilsonLower(a.helpful ?? a.votes, a.votes);
  const qb = wilsonLower(b.helpful ?? b.votes, b.votes);
  if (qb !== qa) return qb - qa;
  return Date.parse(a.createdAt) - Date.parse(b.createdAt);
}

/** Who holds the top slot today, for one kind. */
export function pickForKind(candidates: PickCandidate[], kind: PickKind): KindPick {
  const ofKind = candidates.filter((c) => c.kind === kind);
  if (ofKind.length === 0) return { id: null, reason: 'none', votes: 0 };

  const fresh = ofKind.filter((c) => c.featuredOn == null);
  if (fresh.length > 0) {
    const winner = [...fresh].sort(byQualityThenOldest)[0];
    return {
      id: winner.id,
      reason: winner.votes > 0 ? 'by_votes' : 'queue_order',
      votes: winner.votes,
    };
  }

  // Everything has had a turn. Bring back whoever has been off the slot
  // longest; votes break ties among equally-stale items.
  const recycled = [...ofKind].sort((a, b) => {
    const d = Date.parse(a.featuredOn!) - Date.parse(b.featuredOn!);
    if (d !== 0) return d;
    return byQualityThenOldest(a, b);
  })[0];
  return { id: recycled.id, reason: 'recycled', votes: recycled.votes };
}

export interface DailyPick {
  question: KindPick;
  tip: KindPick;
}

/** Today's top slot for both kinds. */
export function pickForToday(candidates: PickCandidate[]): DailyPick {
  return {
    question: pickForKind(candidates, 'question'),
    tip: pickForKind(candidates, 'tip'),
  };
}

// ── Runway ──────────────────────────────────────────────────────────────────
//
// "Make this pipeline for at least the next one month." One item per kind per
// day, so a month needs ~30 never-featured items of that kind. Below that the
// rotation still runs — recycling covers it — but students start seeing repeats
// before the month is out, so the founder should know the real number rather
// than discover it in week three.

export const RUNWAY_TARGET_DAYS = 30;

export interface Runway {
  kind: PickKind;
  freshItems: number;
  totalItems: number;
  /** Days until the first repeat is shown. */
  daysOfFreshStock: number;
  meetsMonth: boolean;
  /** How many more submissions are needed to reach a month without repeats. */
  shortfall: number;
}

export function runwayFor(candidates: PickCandidate[], kind: PickKind): Runway {
  const ofKind = candidates.filter((c) => c.kind === kind);
  const fresh = ofKind.filter((c) => c.featuredOn == null).length;
  return {
    kind,
    freshItems: fresh,
    totalItems: ofKind.length,
    daysOfFreshStock: fresh,
    meetsMonth: fresh >= RUNWAY_TARGET_DAYS,
    shortfall: Math.max(0, RUNWAY_TARGET_DAYS - fresh),
  };
}
