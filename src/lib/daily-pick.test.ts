import { describe, it, expect } from 'vitest';
import { pickForKind, pickForToday, runwayFor, RUNWAY_TARGET_DAYS, type PickCandidate } from './daily-pick';

const q = (id: string, votes: number, day: string, featuredOn: string | null = null): PickCandidate =>
  ({ id, kind: 'question', votes, createdAt: `2026-07-${day}T10:00:00.000Z`, featuredOn });
const t = (id: string, votes: number, day: string, featuredOn: string | null = null): PickCandidate =>
  ({ id, kind: 'tip', votes, createdAt: `2026-07-${day}T10:00:00.000Z`, featuredOn });

describe('most votes takes the top slot', () => {
  it('picks the highest-voted item', () => {
    const pick = pickForKind([q('a', 2, '10'), q('b', 9, '11'), q('c', 5, '12')], 'question');
    expect(pick.id).toBe('b');
    expect(pick.reason).toBe('by_votes');
    expect(pick.votes).toBe(9);
  });

  it('breaks vote ties by oldest first', () => {
    // Fairness: a newer submission must not jump items that have waited longer.
    const pick = pickForKind([q('new', 4, '20'), q('old', 4, '02'), q('mid', 4, '11')], 'question');
    expect(pick.id).toBe('old');
  });
});

describe('no votes is not a blocker', () => {
  it('promotes the oldest item when the scoreboard is empty', () => {
    // The founder's rule: "if no voting, the one you'd have kept in the
    // pipeline moves to the top." This is the case that was broken before —
    // the old 5-vote bar meant a pool with no votes featured NOTHING, forever.
    const pick = pickForKind([q('c', 0, '14'), q('a', 0, '03'), q('b', 0, '09')], 'question');
    expect(pick.id).toBe('a');
    expect(pick.reason).toBe('queue_order');
    expect(pick.votes).toBe(0);
  });

  it('one vote is enough to outrank the queue', () => {
    // There is no threshold. A single vote beats age.
    const pick = pickForKind([q('older', 0, '01'), q('voted', 1, '28')], 'question');
    expect(pick.id).toBe('voted');
    expect(pick.reason).toBe('by_votes');
  });
});

describe('one day on top, then it steps aside', () => {
  it('never re-picks an item that has already held the slot', () => {
    // Even if it is by far the most voted. This is what makes "max 1 day" true.
    const pick = pickForKind(
      [q('yesterdays_winner', 50, '10', '2026-07-28'), q('fresh', 1, '11')],
      'question',
    );
    expect(pick.id).toBe('fresh');
  });

  it('turns over every day across a run', () => {
    // Simulate five consecutive days, stamping the winner each day. The whole
    // point of the spec: a different item every single day.
    const pool: PickCandidate[] = [
      q('a', 5, '01'), q('b', 4, '02'), q('c', 3, '03'), q('d', 2, '04'), q('e', 1, '05'),
    ];
    const seen: string[] = [];
    for (let d = 1; d <= 5; d++) {
      const pick = pickForKind(pool, 'question');
      seen.push(pick.id!);
      const row = pool.find((p) => p.id === pick.id)!;
      row.featuredOn = `2026-08-0${d}`;
    }
    expect(seen).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(new Set(seen).size).toBe(5); // no repeats while stock lasts
  });
});

describe('the shelf never runs dry', () => {
  it('recycles the item that held the slot longest ago', () => {
    const pick = pickForKind(
      [
        q('recent', 9, '01', '2026-07-27'),
        q('stalest', 1, '02', '2026-07-05'),
        q('middle', 5, '03', '2026-07-15'),
      ],
      'question',
    );
    expect(pick.id).toBe('stalest');
    expect(pick.reason).toBe('recycled');
  });

  it('does not immediately repeat yesterday even when recycling', () => {
    // Two items, both used. Yesterday's must not come straight back today.
    const pick = pickForKind(
      [q('used_today', 9, '01', '2026-07-28'), q('used_last_week', 0, '02', '2026-07-21')],
      'question',
    );
    expect(pick.id).toBe('used_last_week');
  });

  it('returns none when a kind has no items at all', () => {
    expect(pickForKind([t('only_a_tip', 3, '01')], 'question')).toEqual({ id: null, reason: 'none', votes: 0 });
  });
});

describe('questions and tips rotate independently', () => {
  it('picks one of each', () => {
    const pick = pickForToday([q('q1', 1, '01'), q('q2', 5, '02'), t('t1', 2, '01'), t('t2', 9, '02')]);
    expect(pick.question.id).toBe('q2');
    expect(pick.tip.id).toBe('t2');
  });

  it('a tip having no stock does not affect the question slot', () => {
    const pick = pickForToday([q('q1', 0, '01')]);
    expect(pick.question.id).toBe('q1');
    expect(pick.tip).toEqual({ id: null, reason: 'none', votes: 0 });
  });
});

describe('runway — "at least one month"', () => {
  it('reports the real shortfall instead of a vague warning', () => {
    const pool = Array.from({ length: 20 }, (_, i) => q(`q${i}`, 0, String(10 + (i % 20)).padStart(2, '0')));
    const r = runwayFor(pool, 'question');
    expect(r.freshItems).toBe(20);
    expect(r.daysOfFreshStock).toBe(20);
    expect(r.meetsMonth).toBe(false);
    expect(r.shortfall).toBe(RUNWAY_TARGET_DAYS - 20);
  });

  it('counts only never-featured items as runway', () => {
    const r = runwayFor([q('a', 0, '01', '2026-07-20'), q('b', 0, '02')], 'question');
    expect(r.totalItems).toBe(2);
    expect(r.freshItems).toBe(1);
  });

  it('meetsMonth once there is a month of fresh stock', () => {
    const pool = Array.from({ length: RUNWAY_TARGET_DAYS }, (_, i) => q(`q${i}`, 0, '01'));
    expect(runwayFor(pool, 'question').meetsMonth).toBe(true);
  });
});

describe('the most valuable hint goes first (editorial rank, 24 Sep)', () => {
  const r = (id: string, day: string, rank: number | null, featuredOn: string | null = null): PickCandidate =>
    ({ ...t(id, 0, day, featuredOn), rank });

  it('a lower rank beats an older hint', () => {
    // Founder: "keep the most relevant and valuable hints on top." With no
    // feed there are no votes on unserved stock, so without a rank the queue
    // was insertion order.
    const pick = pickForKind([r('old', '01', 40), r('best', '20', 1), r('mid', '10', 7)], 'tip');
    expect(pick.id).toBe('best');
  });

  it('ranked stock is served before unranked, whatever its age', () => {
    const pick = pickForKind([r('unranked-old', '01', null), r('ranked-new', '25', 90)], 'tip');
    expect(pick.id).toBe('ranked-new');
  });

  it('among unranked items the old order still holds', () => {
    const pick = pickForKind([r('b', '09', null), r('a', '03', null)], 'tip');
    expect(pick.id).toBe('a');
  });

  it('walks the ranks in order across days, and never repeats while stock lasts', () => {
    let pool = [r('third', '01', 3), r('first', '02', 1), r('second', '03', 2)];
    const served: string[] = [];
    for (const day of ['2026-10-01', '2026-10-02', '2026-10-03']) {
      const id = pickForKind(pool, 'tip').id!;
      served.push(id);
      pool = pool.map((c) => (c.id === id ? { ...c, featuredOn: day } : c));
    }
    expect(served).toEqual(['first', 'second', 'third']);
  });

  it('a rank does not bring an already-served hint back while fresh stock remains', () => {
    const pick = pickForKind([r('served', '01', 1, '2026-09-20'), r('fresh', '02', 50)], 'tip');
    expect(pick.id).toBe('fresh');
  });
});

describe('payload.rank is read strictly', () => {
  it('only a positive integer is a rank; anything else is unranked, never a guess', async () => {
    const { rankOf } = await import('./daily-pick-runner');
    expect(rankOf({ rank: 1 })).toBe(1);
    expect(rankOf({ rank: 160 })).toBe(160);
    for (const bad of [{ rank: 0 }, { rank: -3 }, { rank: 2.5 }, { rank: '1' }, { rank: null }, {}, null, undefined]) {
      expect(rankOf(bad as { rank?: unknown } | null | undefined), JSON.stringify(bad)).toBeNull();
    }
  });
});
