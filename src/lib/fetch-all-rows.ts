// Fetch a windowed query to exhaustion instead of trusting one response.
//
// PostgREST caps every response at 1,000 rows server-side regardless of the
// .limit() you ask for, and an un-ordered query returns whatever slice
// Postgres likes. The analytics page was burned by this ("506 tracked events
// over 14 days" when there were 18,000) and fixed itself; launch-metrics,
// momentum and the growth funnel then re-introduced the same failure mode
// independently. This is the one shared implementation so the next dashboard
// can't.
//
// The caller's query MUST have a stable .order() — pagination over an
// unordered query can repeat or skip rows between pages.

type PageQuery = (from: number, to: number) => PromiseLike<{ data: unknown[] | null }>;

export async function fetchAllRows<T>(
  page: PageQuery,
  opts: { pageSize?: number; maxPages?: number } = {}
): Promise<{ rows: T[]; truncated: boolean }> {
  const size = opts.pageSize ?? 1000;
  // Bounded so a runaway table degrades to an honest `truncated` flag, never
  // a hung admin page.
  const maxPages = opts.maxPages ?? 30;
  const rows: T[] = [];
  for (let p = 0; p < maxPages; p++) {
    const { data } = await page(p * size, p * size + size - 1);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < size) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}
