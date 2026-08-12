import { describe, it, expect } from 'vitest';
import {
  mayShowVoteCount, voteDisplay, orderFeed, rankContributors, myRank,
  VOTE_COUNT_REVEAL_MIN, MIN_VOTES_FOR_ELIGIBILITY, MONTHLY_WINNERS,
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

  it('returns count: null — the UI is never handed a number it must hide', () => {
    // Defence in depth: the small number does not reach the component at all,
    // so it cannot leak through a future redesign or a network tab.
    const d = voteDisplay(row({ helpfulVotes: 3, totalVotes: 4 }));
    expect(d.count).toBeNull();
  });

  it('passes the count through once it has earned the right to be seen', () => {
    const d = voteDisplay(row({ helpfulVotes: 40, totalVotes: 44 }));
    expect(d.count).toBe(40);
  });
});

describe('who may vote', () => {
  it('never lets a student vote on their own contribution', () => {
    expect(voteDisplay(row({ isMine: true })).canVote).toBe(false);
  });

  it('never asks twice', () => {
    expect(voteDisplay(row({ votedByMe: true })).canVote).toBe(false);
  });

  it('offers the vote to everyone else', () => {
    expect(voteDisplay(row()).canVote).toBe(true);
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

describe('the monthly Buddy reward cannot be farmed', () => {
  const c = (id: string, helpful: number, total: number, contributions = 1) =>
    ({ studentId: id, helpful, total, contributions });

  it('ignores anyone below the eligibility floor — one friend is not a batch', () => {
    const out = rankContributors([c('friend-voted', 1, 1), c('real', 8, 10)]);
    expect(out.map((x) => x.studentId)).toEqual(['real']);
    expect(MIN_VOTES_FOR_ELIGIBILITY).toBeGreaterThan(1);
  });

  it('ranks on NET helpful, so being widely disliked cannot win', () => {
    // 30 helpful / 60 total = net 0. 12 helpful / 12 total = net 12.
    const out = rankContributors([c('loud', 30, 60), c('good', 12, 12)]);
    expect(out[0].studentId).toBe('good');
  });

  it('prefers one genuinely useful post over five mediocre ones on a tie', () => {
    const out = rankContributors([c('spammer', 10, 10, 5), c('careful', 10, 10, 1)]);
    expect(out[0].studentId).toBe('careful');
  });

  it('takes exactly ten, and is deterministic on a full tie', () => {
    const many = Array.from({ length: 30 }, (_, i) => c(`s${String(i).padStart(2, '0')}`, 10, 10));
    const out = rankContributors(many);
    expect(out).toHaveLength(MONTHLY_WINNERS);
    expect(rankContributors(many).map((x) => x.studentId)).toEqual(out.map((x) => x.studentId));
  });

  it('returns nobody rather than padding the list when few qualify', () => {
    expect(rankContributors([c('a', 1, 2), c('b', 0, 1)])).toEqual([]);
  });
});

describe('rank is the reward, the count is only the mechanism', () => {
  const c = (id: string, helpful: number, total: number, contributions = 1) =>
    ({ studentId: id, helpful, total, contributions });

  it('gives a 1-indexed position — nobody is #0', () => {
    const board = [c('a', 20, 20), c('b', 10, 10), c('c', 6, 6)];
    expect(myRank(board, 'a')).toBe(1);
    expect(myRank(board, 'c')).toBe(3);
  });

  it('returns null for a student who has not qualified yet', () => {
    // An unearned rank is worse than no rank.
    expect(myRank([c('a', 20, 20)], 'nobody')).toBeNull();
    expect(myRank([c('new', 1, 1)], 'new')).toBeNull();
  });

  it('agrees with the winners list — one ordering, not two', () => {
    const board = Array.from({ length: 15 }, (_, i) => c(`s${i}`, 30 - i, 30 - i));
    const winners = rankContributors(board).map((x) => x.studentId);
    for (let i = 0; i < winners.length; i++) {
      expect(myRank(board, winners[i])).toBe(i + 1);
    }
  });

  it('reveals no population size — rank alone cannot be reverse-engineered', () => {
    // Two boards of very different sizes give the top student the same rank.
    const small = [c('me', 20, 20), c('x', 5, 5)];
    const large = Array.from({ length: 400 }, (_, i) => c(`p${i}`, 5, 5)).concat([c('me', 99, 99)]);
    expect(myRank(small, 'me')).toBe(myRank(large, 'me'));
  });
});
