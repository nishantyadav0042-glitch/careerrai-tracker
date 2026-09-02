import { describe, it, expect } from 'vitest';
import { fetchAll, PAGE_SIZE, MAX_PAGES } from './fetch-all';

// ── Incident #64: a population read must never be silently shortened ────────
//
// The Command Center showed STUDENTS 1000 for three days while 1,036 existed.
// PostgREST caps an unbounded select at max-rows (1000) and reports nothing.
// These tests pin the three properties that make a paged read honest: an
// explicit order, termination proven by a short page, and a ceiling that fails
// loud instead of returning a shorter array.

type Row = { id: number };

/** A fake PostgREST table: `.order().range(from,to)` slices a fixed row set,
 *  and records every call so the tests can assert HOW it was read. */
function table(total: number, opts: { failOnPage?: number; nullOnPage?: number } = {}) {
  const rows: Row[] = Array.from({ length: total }, (_, i) => ({ id: i + 1 }));
  const calls: { orderBy: string; ascending: boolean; from: number; to: number }[] = [];
  let builds = 0;
  const build = () => {
    builds += 1;
    let orderBy = ''; let ascending = true;
    return {
      order(col: string, o: { ascending: boolean }) { orderBy = col; ascending = o.ascending; return this; },
      async range(from: number, to: number) {
        calls.push({ orderBy, ascending, from, to });
        const page = Math.floor(from / (to - from + 1));
        if (opts.failOnPage === page) return { data: null, error: { message: 'boom' } };
        if (opts.nullOnPage === page) return { data: null, error: null };
        const sorted = ascending ? rows : [...rows].reverse();
        return { data: sorted.slice(from, to + 1), error: null };
      },
    };
  };
  return { build, calls, builds: () => builds };
}

describe('fetchAll pages until a short page proves the end', () => {
  it('returns every row past the 1000 cap, in one array', async () => {
    const t = table(1036);
    const { data, error, pages } = await fetchAll<Row>(t.build);
    expect(error).toBeNull();
    expect(data).toHaveLength(1036);
    expect(pages).toBe(2);
    // The exact founder-visible case: 1036 real students, tile said 1000.
    expect(data![1035].id).toBe(1036);
  });

  it('a table that fits in one page still costs exactly one request', async () => {
    const t = table(258);
    const { data, pages } = await fetchAll<Row>(t.build);
    expect(data).toHaveLength(258);
    expect(pages).toBe(1);
    expect(t.calls).toHaveLength(1);
  });

  it('an exact multiple of the page size needs one more (empty) page to prove the end', async () => {
    // 1000 rows: the first page is full, so termination is NOT yet proven.
    const t = table(PAGE_SIZE);
    const { data, pages } = await fetchAll<Row>(t.build);
    expect(data).toHaveLength(PAGE_SIZE);
    expect(pages).toBe(2);
  });

  it('an empty table is an empty array, not an error', async () => {
    const { data, error } = await fetchAll<Row>(table(0).build);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('rebuilds the query for every page — a PostgREST builder is mutable', async () => {
    const t = table(2500);
    await fetchAll<Row>(t.build);
    expect(t.builds()).toBe(3);
    expect(t.calls.map((c) => [c.from, c.to])).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });
});

describe('fetchAll always orders, so pages cannot overlap or skip', () => {
  it("orders by 'id' ascending when nothing is specified", async () => {
    const t = table(5);
    await fetchAll<Row>(t.build);
    expect(t.calls[0]).toMatchObject({ orderBy: 'id', ascending: true });
  });

  it('honours the caller\'s order column and direction on every page', async () => {
    const t = table(1500);
    const { data } = await fetchAll<Row>(t.build, { orderBy: 'student_id', ascending: false });
    for (const c of t.calls) expect(c).toMatchObject({ orderBy: 'student_id', ascending: false });
    expect(data![0].id).toBe(1500);
  });
});

describe('fetchAll fails loud, never short', () => {
  it('a failed page returns the error and NO partial data', async () => {
    const t = table(2500, { failOnPage: 1 });
    const { data, error, pages } = await fetchAll<Row>(t.build);
    expect(error).toEqual({ message: 'boom' });
    expect(data).toBeNull();
    expect(pages).toBe(2);
  });

  it('null data with no error is a request that never completed, not an empty page', async () => {
    const t = table(50, { nullOnPage: 0 });
    const { data, error } = await fetchAll<Row>(t.build);
    expect(data).toBeNull();
    expect(error?.message).toMatch(/no data and no error/);
  });

  it('refuses to return a set that exceeds the page ceiling', async () => {
    const t = table(5000);
    const { data, error, pages } = await fetchAll<Row>(t.build, { pageSize: 1000, maxPages: 3 });
    expect(data).toBeNull();
    expect(error?.message).toMatch(/exceeded 3 pages/);
    expect(pages).toBe(3);
  });

  it('refuses a value that is not a PostgREST builder', async () => {
    // The trap this closes: passing a plain promise or the builder itself
    // (not a thunk) would otherwise run ONE unbounded read and return the
    // capped result as if it had been paged.
    const { data, error } = await fetchAll(() => ({ then: () => undefined }) as never);
    expect(data).toBeNull();
    expect(error?.message).toMatch(/must return a PostgREST query/);
  });

  it('the default ceiling is large enough for every table we hold today', () => {
    // student_events was 237,605 rows on 2 Sep 2026. If this ever trips, raise
    // it deliberately — do not let a read fall back to a single request.
    expect(MAX_PAGES * PAGE_SIZE).toBeGreaterThanOrEqual(200_000);
  });
});
