import { describe, it, expect } from 'vitest';
import {
  readRows, rowsOrEmpty, mapSource, allSources, isAnswered, isUnavailable,
  value, noData, unavailable, type Source,
} from './source';
import { readRowsForIds, chunkIds, CHUNK_SIZE } from './batch';
import { gateOnSource, skippedRun } from './mutation-gate';

// ── The 23 Aug incident, encoded ────────────────────────────────────────────
//
// 56 students who had studied were recorded as having studied nothing, and 282
// days were added to their syllabus dates, because a failed read and an empty
// result were the same value. Each test below fails against that behaviour.

const dbError = { data: null, error: { message: 'canceling statement due to statement timeout' } };
const emptyOk = { data: [] as number[], error: null };
const rowsOk = { data: [1, 2, 3], error: null };

describe('GUARD 3 — UNKNOWN cannot become ZERO', () => {
  it('a query error is UNAVAILABLE, never an empty result', async () => {
    const s = await readRows('daily_reports', async () => dbError);
    expect(s.state).toBe('unavailable');
    expect(isAnswered(s)).toBe(false);
  });

  it('data:null with NO error is still UNAVAILABLE — the exact shape that broke production', async () => {
    // supabase-js returns this when the request never completed. The old code
    // did `reports ?? []` here and every student became zero hours.
    const s = await readRows('daily_reports', async () => ({ data: null, error: null }));
    expect(s.state).toBe('unavailable');
  });

  it('a successful query returning no rows is NO_DATA — a real answer', async () => {
    const s = await readRows('daily_reports', async () => emptyOk);
    expect(s.state).toBe('no_data');
    expect(isAnswered(s)).toBe(true);
  });

  it('the two are never equal, which is the whole point', async () => {
    const failed = await readRows('x', async () => dbError);
    const empty = await readRows('x', async () => emptyOk);
    expect(failed.state).not.toBe(empty.state);
  });

  it('a thrown exception is UNAVAILABLE, not a crash and not a zero', async () => {
    const s = await readRows('x', async () => { throw new Error('socket hang up'); });
    expect(s.state).toBe('unavailable');
    expect(isUnavailable(s) && s.reason).toContain('socket hang up');
  });
});

describe('GUARD 1 — a failed read cannot produce a numeric business fact', () => {
  it('rowsOrEmpty REFUSES to flatten an unavailable read', async () => {
    const s = await readRows<number>('daily_reports', async () => dbError);
    expect(() => rowsOrEmpty(s)).toThrow(/refusing/i);
  });

  it('rowsOrEmpty gives [] only for a genuine empty answer', async () => {
    expect(rowsOrEmpty(await readRows<number>('x', async () => emptyOk))).toEqual([]);
  });

  it('a calculation cannot resurrect a failed read', () => {
    const failed = unavailable<number[]>('db down');
    const summed = mapSource(failed, (rows) => rows.reduce((a, b) => a + b, 0));
    expect(summed.state).toBe('unavailable');
    // The old code produced 0 here and called it "hours studied".
    expect(summed).not.toHaveProperty('value');
  });

  it('the module offers no default-value escape hatch', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/lib/truth/source.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const banned of ['valueOr', 'unwrapOr', 'orElse', 'getOrDefault']) {
      expect(src).not.toContain(banned);
    }
  });
});

describe('GUARD 2 / 9 — a failed read cannot mutate student state', () => {
  it('the gate refuses to proceed when the source is unavailable', () => {
    const g = gateOnSource(unavailable<number[]>('timeout'));
    expect(g.proceed).toBe(false);
    expect(g.proceed === false && g.skipped).toBe('source_unavailable');
  });

  it('the gate proceeds on a genuine empty answer', () => {
    const g = gateOnSource(noData<number[]>());
    expect(g.proceed).toBe(true);
    expect(g.proceed === true && g.data).toEqual([]);
  });

  it('the gate proceeds on real rows', () => {
    const g = gateOnSource(value([1, 2]));
    expect(g.proceed === true && g.data).toEqual([1, 2]);
  });

  it('a skipped run is not reportable as a successful one', () => {
    const r = skippedRun('daily_reports: timeout');
    expect(r.ok).toBe(false);
    expect(r.mutated).toBe(0);
  });
});

describe('GUARD 8 — request size is bounded by chunk, not by population', () => {
  const sizes = [656, 1_000, 5_000, 50_000];

  it('no chunk ever exceeds the ceiling, at any population', () => {
    for (const n of sizes) {
      const ids = Array.from({ length: n }, (_, i) => `id-${i}`);
      const chunks = chunkIds(ids);
      expect(Math.max(...chunks.map((c) => c.length))).toBeLessThanOrEqual(CHUNK_SIZE);
      expect(chunks.reduce((a, c) => a + c.length, 0)).toBe(n);
    }
  });

  it('request count grows linearly while request SIZE stays flat', () => {
    expect(chunkIds(Array.from({ length: 50_000 }, (_, i) => i)).length).toBe(500);
    expect(chunkIds(Array.from({ length: 656 }, (_, i) => i)).length).toBe(7);
  });

  it('the ceiling keeps a real URL inside a safe budget', () => {
    // 100 UUIDs plus separators, well under the ~8KB proxies commonly allow.
    const uuidish = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    expect(CHUNK_SIZE * (uuidish.length + 1)).toBeLessThan(8000);
  });

  it('every id is fetched exactly once across the chunks', async () => {
    const ids = Array.from({ length: 656 }, (_, i) => i);
    const seen: number[] = [];
    const s = await readRowsForIds('t', ids, async (chunk) => {
      expect(chunk.length).toBeLessThanOrEqual(CHUNK_SIZE);
      seen.push(...chunk);
      return { data: chunk.map((i) => ({ i })), error: null };
    });
    expect(s.state).toBe('value');
    expect(seen).toHaveLength(656);
    expect(new Set(seen).size).toBe(656);
  });
});

describe('partial reads are UNAVAILABLE, never a smaller valid dataset', () => {
  it('one failing chunk poisons the whole read', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => i);
    let call = 0;
    const s = await readRowsForIds('daily_reports', ids, async (chunk) => {
      call += 1;
      if (call === 2) return { data: null, error: { message: 'timeout' } };
      return { data: chunk.map((i) => ({ i })), error: null };
    });
    expect(s.state).toBe('unavailable');
    // The dangerous alternative: 200 of 250 students' rows, looking like a
    // complete week with less studying in it.
    expect(s).not.toHaveProperty('value');
  });

  it('all chunks empty is NO_DATA, which is a legitimate zero', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => i);
    const s = await readRowsForIds('x', ids, async () => ({ data: [], error: null }));
    expect(s.state).toBe('no_data');
  });

  it('no ids at all is NO_DATA, not a failure', async () => {
    const s = await readRowsForIds('x', [], async () => ({ data: [], error: null }));
    expect(s.state).toBe('no_data');
  });
});

describe('aggregation keeps the boundary', () => {
  it('one unavailable source makes the aggregate unavailable', () => {
    const parts: Source<number>[] = [value(1), unavailable<number>('db down'), value(3)];
    expect(allSources(parts).state).toBe('unavailable');
  });

  it('values aggregate normally when every part answered', () => {
    const agg = allSources<number>([value(1), noData<number>(), value(3)]);
    expect(agg.state).toBe('value');
    expect(agg.state === 'value' && agg.value).toEqual([1, 3]);
  });
});

describe('the real query shape round-trips', () => {
  it('rows come through as a value', async () => {
    const s = await readRows('x', async () => rowsOk);
    expect(s.state === 'value' && s.value).toEqual([1, 2, 3]);
  });
});

describe('the old shape really did produce the false fact', () => {
  // Not a hypothetical. This is the destructure and fallback that ran in
  // weekly-plan-reconcile, exercised here so the guards above are demonstrably
  // protecting against real behaviour rather than an imagined one.
  it('data-without-error plus a ?? [] fallback yields "zero hours studied"', async () => {
    const query = async () => ({ data: null as { study_duration: number }[] | null, error: { message: 'request too large' } });

    // ── the old way ──────────────────────────────────────────────────────
    const { data: reports } = await query();          // error discarded
    const hoursByDay = new Map<string, number>();
    for (const r of reports ?? []) hoursByDay.set('mon', Number(r.study_duration ?? 0));
    const oldWeek = ['mon','tue','wed','thu','fri','sat','sun'].map((d) => hoursByDay.get(d) ?? 0);
    const oldTotal = oldWeek.reduce((a, b) => a + b, 0);

    expect(oldWeek).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(oldTotal).toBe(0);   // <- 35.3 real hours, recorded as 0

    // ── the boundary ─────────────────────────────────────────────────────
    const s = await readRows('daily_reports', query);
    expect(s.state).toBe('unavailable');
    expect(gateOnSource(s).proceed).toBe(false);   // no deficit, no date moved
  });
});
