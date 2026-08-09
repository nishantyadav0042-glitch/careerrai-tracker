import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import {
  sweep, chunked, incompleteWarning, SWEEP_CONCURRENCY, SWEEP_SAFETY_MARGIN_MS, IN_CHUNK,
} from './cron-sweep';

// A fake clock. Real timers would make these tests slow and flaky, and the
// property under test is arithmetic about a deadline, not actual waiting.
function clock(startMs = 0) {
  let t = startMs;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

describe('a sweep never drops the tail in silence', () => {
  it('reports complete only when every student was attempted', async () => {
    const c = clock();
    const seen: number[] = [];
    const r = await sweep({
      items: [1, 2, 3, 4, 5],
      budgetMs: 60_000,
      concurrency: 1,
      now: c.now,
      handler: async (n) => { seen.push(n); c.advance(10); },
    });
    expect(seen).toEqual([1, 2, 3, 4, 5]);
    expect(r).toMatchObject({ processed: 5, failed: 0, complete: true, remaining: 0 });
  });

  it('stops at the budget and says exactly how many were never reached', async () => {
    // The defect this replaces: the loop was killed mid-way and the response
    // still read like a full run. Here the shortfall is a number.
    const c = clock();
    const r = await sweep({
      items: Array.from({ length: 100 }, (_, i) => i),
      budgetMs: SWEEP_SAFETY_MARGIN_MS + 50, // room for ~5 items at 10ms
      concurrency: 1,
      now: c.now,
      handler: async () => { c.advance(10); },
    });
    expect(r.complete).toBe(false);
    expect(r.processed).toBeGreaterThan(0);
    expect(r.processed).toBeLessThan(100);
    expect(r.remaining).toBe(100 - r.processed);
    expect(r.cursor).toBe(r.processed);
  });

  it('keeps the safety margin so it can still report being out of time', async () => {
    // A sweep that spends its entire ceiling and is killed while writing the
    // alert has reported nothing — which is the original bug wearing a hat.
    const c = clock();
    const r = await sweep({
      items: [1, 2, 3],
      budgetMs: SWEEP_SAFETY_MARGIN_MS, // margin consumes the whole budget
      concurrency: 1,
      now: c.now,
      handler: async () => { c.advance(1); },
    });
    expect(r.processed).toBe(0);
    expect(r.complete).toBe(false);
    expect(r.remaining).toBe(3);
  });

  it('never reports negative remaining, whatever the concurrency', async () => {
    // Workers claim an index before finding the list empty, so the raw counter
    // overshoots by up to `concurrency`. Unclamped this produced remaining: -7.
    const r = await sweep({
      items: [1, 2, 3],
      budgetMs: 60_000,
      concurrency: 10,
      handler: async () => {},
    });
    expect(r.remaining).toBe(0);
    expect(r.cursor).toBe(3);
    expect(r.complete).toBe(true);
  });
});

describe('one bad student does not cost everyone else their reminder', () => {
  it('contains a throw and still finishes the roster', async () => {
    const done: number[] = [];
    const r = await sweep({
      items: [1, 2, 3, 4],
      budgetMs: 60_000,
      concurrency: 1,
      handler: async (n) => {
        if (n === 2) throw new Error('malformed profile');
        done.push(n);
      },
    });
    expect(done).toEqual([1, 3, 4]);
    expect(r.failed).toBe(1);
    expect(r.processed).toBe(4);
    expect(r.complete).toBe(true);
  });
});

describe('concurrency is what actually moves the cliff', () => {
  it('runs several students at once instead of waiting for each', async () => {
    let inFlight = 0;
    let peak = 0;
    await sweep({
      items: Array.from({ length: 40 }, (_, i) => i),
      budgetMs: 60_000,
      concurrency: 8,
      handler: async () => {
        inFlight++; peak = Math.max(peak, inFlight);
        await Promise.resolve();
        inFlight--;
      },
    });
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(8);
  });

  it('the default is bounded — an unbounded fan-out would exhaust the pool', async () => {
    // Supabase has a connection ceiling. "All 10,000 at once" trades a slow
    // cron for a database outage, which is a worse trade.
    expect(SWEEP_CONCURRENCY).toBeGreaterThan(1);
    expect(SWEEP_CONCURRENCY).toBeLessThanOrEqual(16);
  });
});

describe('chunking, because .in() has its own ceiling', () => {
  it('splits a large id list into URL-safe pieces', () => {
    const ids = Array.from({ length: 1_000 }, (_, i) => i);
    const parts = chunked(ids);
    expect(parts.length).toBe(Math.ceil(1_000 / IN_CHUNK));
    expect(parts.flat()).toEqual(ids);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(IN_CHUNK);
  });

  it('handles an empty list and rejects a nonsense size', () => {
    expect(chunked([])).toEqual([]);
    expect(() => chunked([1], 0)).toThrow();
  });
});

describe('an incomplete sweep reads like the incident it is', () => {
  it('names the cron, the shortfall and where to resume', () => {
    const msg = incompleteWarning('daily-reminder', {
      processed: 812, failed: 0, complete: false, remaining: 9_188, cursor: 812,
    });
    expect(msg).toContain('daily-reminder');
    expect(msg).toContain('INCOMPLETE');
    expect(msg).toContain('9188');
    expect(msg).toContain('812');
  });
});

describe('every all-roster cron declares a duration ceiling', () => {
  it('has no cron that sweeps students on the default cap', () => {
    // Thirteen of seventeen declared no maxDuration at all, so they inherited
    // a default nobody had chosen — the cliff was not even a decision.
    const dir = 'src/app/api/cron';
    const offenders: string[] = [];
    for (const name of readdirSync(dir)) {
      const path = `${dir}/${name}/route.ts`;
      let src: string;
      try { src = readFileSync(path, 'utf8'); } catch { continue; }
      const sweepsRoster = /\.eq\('role',\s*'student'\)/.test(src);
      if (sweepsRoster && !src.includes('maxDuration')) offenders.push(name);
    }
    expect(offenders, `these crons walk every student with no declared ceiling: ${offenders.join(', ')}`)
      .toEqual([]);
  });
});
