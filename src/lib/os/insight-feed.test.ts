import { describe, it, expect } from 'vitest';
import {
  mayShowVoteCount, voteDisplay, orderFeed, orderFeedTop, netScore,
  helpfulPct, HELPFUL_PCT_MIN_VOTES, VOTE_COUNT_REVEAL_MIN,
  type InsightRow,
} from './insight-feed';

// The one rule this file exists to enforce: a student must never be able to
// read our size off the screen. Every other behaviour here is secondary.

const row = (over: Partial<InsightRow> = {}): InsightRow => ({
  id: 'a', kind: 'tip', text: 'x', section: null, displayName: 'Aryan',
  imageUrl: null, helpfulVotes: 0, totalVotes: 0,
  createdAt: '2026-08-12T10:00:00Z', isMine: false, votedByMe: false,
  ...over,
});

describe('no small numbers, ever', () => {
  it('hides the count at the scale that makes us look empty', () => {
    for (const n of [0, 1, 2, 3, 7, 12, 24]) expect(mayShowVoteCount(n)).toBe(false);
  });

  it('reveals it only once the number is itself evidence', () => {
    expect(mayShowVoteCount(VOTE_COUNT_REVEAL_MIN)).toBe(true);
    expect(mayShowVoteCount(VOTE_COUNT_REVEAL_MIN - 1)).toBe(false);
  });

  it('the threshold is set high enough to be worth having', () => {
    // Guards against someone quietly lowering it so the feed "looks alive".
    expect(VOTE_COUNT_REVEAL_MIN).toBeGreaterThanOrEqual(20);
  });

  // Founder, 20 Aug: no raw counts on a card — they are small, and a small
  // number announces the size of the room. A ratio does not.
  it('hands the UI a percentage, never a count', () => {
    const d = voteDisplay(row({ helpfulVotes: 9, totalVotes: 11 }));
    expect(d.helpfulPct).toBe(82);
    expect(d).not.toHaveProperty('score');
    expect(d).not.toHaveProperty('count');
  });

  it('shows NO percentage below the sample floor — two votes cannot say 100%', () => {
    expect(helpfulPct({ helpfulVotes: 2, totalVotes: 2 })).toBeNull();
    expect(helpfulPct({ helpfulVotes: 3, totalVotes: 3 })).toBeNull();
    expect(voteDisplay(row({ helpfulVotes: 5, totalVotes: 5 })).helpfulPct).toBeNull();
  });

  it('the floor is a real sample, and it is documented as a constant', () => {
    expect(HELPFUL_PCT_MIN_VOTES).toBeGreaterThanOrEqual(10);
    expect(helpfulPct({ helpfulVotes: 8, totalVotes: HELPFUL_PCT_MIN_VOTES })).toBe(80);
    expect(helpfulPct({ helpfulVotes: 8, totalVotes: HELPFUL_PCT_MIN_VOTES - 1 })).toBeNull();
  });

  it('the score still exists for RANKING — it is computed, just never printed', () => {
    expect(netScore({ helpfulVotes: 3, totalVotes: 4 })).toBe(2);
  });

  it('netScore has exactly one definition: helpful minus not-helpful', () => {
    expect(netScore({ helpfulVotes: 5, totalVotes: 8 })).toBe(2);
    expect(netScore({ helpfulVotes: 0, totalVotes: 3 })).toBe(-3);
  });
});

describe('who may vote', () => {
  it('never lets a student vote on their own contribution', () => {
    expect(voteDisplay(row({ isMine: true })).canVote).toBe(false);
  });

  it('still offers the buttons after a vote — a vote can now be changed or removed', () => {
    expect(voteDisplay(row({ votedByMe: true })).canVote).toBe(true);
  });

  it('offers the vote to everyone else', () => {
    expect(voteDisplay(row()).canVote).toBe(true);
  });
});

describe('Top — the best content rises, deterministically', () => {
  it('orders by net score, so downvotes actually push things down', () => {
    const out = orderFeedTop([
      row({ id: 'loved', helpfulVotes: 4, totalVotes: 5, createdAt: '2026-08-01T00:00:00Z' }),   // +3
      row({ id: 'contested', helpfulVotes: 5, totalVotes: 9, createdAt: '2026-08-10T00:00:00Z' }), // +1
      row({ id: 'disliked', helpfulVotes: 1, totalVotes: 4, createdAt: '2026-08-12T00:00:00Z' }),  // -2
    ]);
    expect(out.map((r) => r.id)).toEqual(['loved', 'contested', 'disliked']);
  });

  it('breaks ties newer-first, so fresh good content is not buried by age', () => {
    const out = orderFeedTop([
      row({ id: 'old', helpfulVotes: 2, totalVotes: 2, createdAt: '2026-08-01T00:00:00Z' }),
      row({ id: 'new', helpfulVotes: 2, totalVotes: 2, createdAt: '2026-08-12T00:00:00Z' }),
    ]);
    expect(out.map((r) => r.id)).toEqual(['new', 'old']);
  });

  it('zero-vote items stay visible and deterministic — never filtered out', () => {
    const out = orderFeedTop([
      row({ id: 'scored', helpfulVotes: 1, totalVotes: 1, createdAt: '2026-08-01T00:00:00Z' }),
      row({ id: 'fresh-zero', createdAt: '2026-08-12T00:00:00Z' }),
    ]);
    expect(out).toHaveLength(2);
    expect(out[1].id).toBe('fresh-zero');
  });

  it('voting on something does NOT hide it from Top — Top is about the content', () => {
    const out = orderFeedTop([
      row({ id: 'voted-best', votedByMe: true, helpfulVotes: 3, totalVotes: 3 }),
      row({ id: 'unvoted', helpfulVotes: 1, totalVotes: 1 }),
    ]);
    expect(out[0].id).toBe('voted-best');
  });

  it('does not mutate the input', () => {
    const input = [row({ id: 'a', helpfulVotes: 1, totalVotes: 1 }), row({ id: 'b' })];
    const before = input.map((r) => r.id);
    orderFeedTop(input);
    expect(input.map((r) => r.id)).toEqual(before);
  });
});

describe('feed order rewards contributing, not accumulating', () => {
  it('is newest-first, NOT most-voted-first', () => {
    const out = orderFeed([
      row({ id: 'old-popular', createdAt: '2026-08-01T00:00:00Z', helpfulVotes: 90, totalVotes: 100 }),
      row({ id: 'new-quiet', createdAt: '2026-08-12T00:00:00Z' }),
    ]);
    // Most-voted-first would freeze the same items on top forever on a small
    // base, and starve every new contributor of the only reward we can give.
    expect(out[0].id).toBe('new-quiet');
  });

  it('sinks what the student already voted on, so there is always something to do', () => {
    const out = orderFeed([
      row({ id: 'done', votedByMe: true, createdAt: '2026-08-12T23:00:00Z' }),
      row({ id: 'todo', votedByMe: false, createdAt: '2026-08-01T00:00:00Z' }),
    ]);
    expect(out.map((r) => r.id)).toEqual(['todo', 'done']);
  });

  it('does not mutate the input', () => {
    const input = [row({ id: 'a' }), row({ id: 'b', createdAt: '2026-08-13T00:00:00Z' })];
    const copy = [...input];
    orderFeed(input);
    expect(input).toEqual(copy);
  });
});

// The monthly contributor-reward tests (rankContributors / myRank /
// MONTHLY_WINNERS / MIN_VOTES_FOR_ELIGIBILITY) were removed with the feature
// on 20 Aug — founder ruling: no superstars. The guard that keeps it gone
// lives in no-careerrai-byline.guard.test.ts.
