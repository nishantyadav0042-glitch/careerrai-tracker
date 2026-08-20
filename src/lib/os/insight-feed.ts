// ── Student Insights: the community loop ────────────────────────────────────
//
// HOW A VOTE SHOWS ITS CONSEQUENCE (founder, 20 Aug — two rulings, in order).
//
// First: a vote must visibly do something. Students were voting into a void,
// which reads as a broken product.
//
// Then: do not show raw counts — they are small, and "▲ 2" announces the size
// of the room more loudly than it praises the content.
//
// Both are satisfied without lying, because a vote has THREE consequences and
// only one of them is a number:
//   1. the button state flips instantly — my vote is mine and I can see it
//   2. the item MOVES — ranking is the real consequence of voting
//   3. a percentage appears once the sample can carry one
//
// The percentage obeys the same discipline as challenge.ts SPLIT_MIN_ATTEMPTS
// ("a percentage is noise wearing a suit"): below the floor there is no
// number at all, because "100% found this useful" from two votes is a worse
// lie than the two votes were. Above it, "82% found this useful" is real
// evidence and says nothing about how many of us there are — it reads the
// same at 300 students and at 300,000.
//
// That constraint is the entire design problem, and it has a clean answer:
//
//   Show RANK. Never show COUNT.
//
// Rank is ordinal. "Today's Top Pick" says one contribution beat the others and
// reveals nothing about whether four students voted or four thousand. Count is
// cardinal — "▲ 2" tells a student exactly how empty the room is, and they will
// believe that number over anything else on the screen.
//
// So votes are always recorded and never displayed, until enough of them exist
// that the number itself becomes interesting rather than embarrassing. This is
// not a new idea in this codebase; it is the third place the same rule appears:
//   · challenge.ts  SPLIT_MIN_ATTEMPTS — "a percentage is noise wearing a suit"
//   · community/vote — returns no tallies at all, because a voter who sees the
//     score votes with the crowd instead of with their judgement
//   · peer-cohort.ts populationProofAllowed — the density gate
// Four surfaces, one principle: a number that makes us look small is worse than
// no number, and a number that steers the vote is worse than both.
//
// What the student gets instead of a count is better anyway: their own action
// reflected back ("Marked helpful"), and the knowledge that the best
// contribution of the day is chosen from what students actually found useful.

export type InsightKind = 'question' | 'tip';

/**
 * Votes needed before a tally may be shown to anybody.
 *
 * Deliberately high. Below this the number does two bad things at once: it
 * advertises how few of us there are, and it anchors the next voter. Above it,
 * "▲ 40 found this helpful" is genuine evidence that something good is here.
 *
 * One constant so switching it on is a founder decision, not an archaeology
 * expedition — same discipline as MIN_ACTIVE_FOR_POPULATION_PROOF.
 */
export const VOTE_COUNT_REVEAL_MIN = 25;

export function mayShowVoteCount(total: number): boolean {
  return total >= VOTE_COUNT_REVEAL_MIN;
}

/**
 * Votes needed before a "% found this useful" may be shown.
 *
 * Lower than VOTE_COUNT_REVEAL_MIN because a ratio survives a smaller sample
 * than a headline count does — but not by much, and deliberately not 1 or 2.
 * At n=3 a single downvote swings the figure by 33 points; at n=10 it moves
 * it by 10, which a student can read as a real opinion rather than an
 * accident. Same reasoning, same shape, as SPLIT_MIN_ATTEMPTS in challenge.ts.
 */
export const HELPFUL_PCT_MIN_VOTES = 10;

/** "% found this useful", or null when the sample cannot carry one. */
export function helpfulPct(row: Pick<InsightRow, 'helpfulVotes' | 'totalVotes'>): number | null {
  if (row.totalVotes < HELPFUL_PCT_MIN_VOTES) return null;
  return Math.round((row.helpfulVotes / row.totalVotes) * 100);
}

export interface InsightRow {
  id: string;
  kind: InsightKind;
  text: string;
  section: string | null;
  /** null for curated content — only real student submissions get a byline. */
  displayName: string | null;
  imageUrl: string | null;
  /** Recorded always, rendered only above the reveal threshold. */
  helpfulVotes: number;
  totalVotes: number;
  createdAt: string;
  /** True when this student wrote it — they may not vote on their own. */
  isMine: boolean;
  /** True when this student has already voted on it. */
  votedByMe: boolean;
}

/** Net score — THE one definition, used by display and every ranking.
 *  score = helpful − not-helpful. Nothing else may re-derive it. */
export function netScore(row: Pick<InsightRow, 'helpfulVotes' | 'totalVotes'>): number {
  return row.helpfulVotes - (row.totalVotes - row.helpfulVotes);
}

/** What the UI is allowed to render for an item's votes. */
export interface VoteDisplay {
  /** "% found this useful", or null below the floor. NEVER a raw count —
   *  the count is what makes the room look empty. */
  helpfulPct: number | null;
  /** Vote buttons always render for others' content — a vote can be
   *  changed or removed, so having voted does not disable them. */
  canVote: boolean;
}

export function voteDisplay(row: InsightRow): VoteDisplay {
  return {
    helpfulPct: helpfulPct(row),
    canVote: !row.isMine,
  };
}

/**
 * Feed order.
 *
 * Not "most voted first" — that is the rich-get-richer failure the Daily Pick
 * ballot already avoids, and on a small base it would freeze the same three
 * items at the top forever while everything else starved. Newest first instead,
 * so a student who contributes today sees their own work near the top of the
 * feed within minutes. That immediacy is the entire reward we can offer a
 * contributor before density exists: not votes, which will not come quickly,
 * but the sight of their thing actually being in the product.
 *
 * Items the student has already voted on sink, so the feed always has something
 * left to do.
 */
export function orderFeed(rows: InsightRow[]): InsightRow[] {
  return [...rows].sort((a, b) => {
    if (a.votedByMe !== b.votedByMe) return a.votedByMe ? 1 : -1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/**
 * TOP — the founder's "best rises" ordering (20 Aug).
 *
 * Net score first, newer first on ties. Deliberately deterministic and
 * deliberately NOT an engagement algorithm: at this community's size a decay
 * formula would be noise wearing a suit. The New tab (orderFeed above) is
 * what protects fresh content from an old high scorer sitting on top —
 * two orderings, not one clever one. votedByMe does NOT sink here: Top is a
 * statement about the content, and hiding what you voted for would bend it.
 */
export function orderFeedTop(rows: InsightRow[]): InsightRow[] {
  return [...rows].sort((a, b) => {
    const d = netScore(b) - netScore(a);
    if (d !== 0) return d;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/** How many cards before "See more". Bounded — this is not a feed to fall into. */
export const FEED_PAGE_SIZE = 8;

// The monthly contributor reward (top 10 by net-helpful → a free Buddy month,
// with rankContributors / rankAll / myRank / MONTHLY_WINNERS /
// MIN_VOTES_FOR_ELIGIBILITY) was DELETED on 20 Aug, not merely unmounted.
// Founder ruling: no superstars — no names, no profiles, no rank, no reward
// for posting, because a board changes WHY a student shares. Leaving the
// ranking machinery exported would have left it one import from returning,
// which is exactly how retired mechanisms come back in this codebase.
