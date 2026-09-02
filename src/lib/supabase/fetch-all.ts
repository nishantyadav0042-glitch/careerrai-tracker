// ── fetchAll: the only sanctioned way to read a whole population ────────────
//
// 2 Sep 2026, Incident #65. The Command Center said STUDENTS 1000 for three
// days while 1,036 real students existed. Nothing was wrong with the count:
// PostgREST caps every response at `max-rows` (Supabase default 1000) and
// returns the first thousand rows of an unbounded `.select()` WITHOUT an
// error, without a header the client surfaces, without a warning. The page
// counted what it was given.
//
// That one tile was the visible symptom. The same shape existed in 134 reads
// across the operator surfaces and the crons, and several of them were
// already truncated for weeks: student_events (237k rows), notifications
// (100k), topic_coverage (50k), funnel_events (19k), decision_log (4k),
// daily_routines (1.9k), student_dna (1,038). Every dashboard built on them was
// quietly reporting a fraction as the whole, and every cron that iterated
// "all students" was skipping whichever ~40 happened to sort last — a set that
// is not even stable across days, because an unordered read follows heap
// order.
//
// A client-side `.limit(20000)` does not help: PostgREST applies max-rows AFTER
// the client limit. The only correct read of a population is paged, and the
// only honest page loop has three properties:
//
//   1. an explicit ORDER, so pages cannot overlap or skip when rows move;
//   2. a termination that is proven by a SHORT page, never assumed;
//   3. a ceiling that fails LOUD — a set that exceeds the ceiling is returned
//      as an error, never as a silently shortened array.
//
// The thunk is deliberate: a PostgREST builder is mutable, so the same query
// must be rebuilt for every page. Pass `() => admin.from(...)...`, not the
// builder itself.
//
// This is a raw-result helper (`{ data, error }`), the same shape a single
// read returns, so a call site changes by one wrapper and nothing downstream.
// Crons that must not act on a partial picture use readAllRows in
// lib/truth/source, which lifts this into the Source type.

export const PAGE_SIZE = 1000;

/** 200 pages × 1000 rows. Above this the read is refused, not shortened. */
export const MAX_PAGES = 200;

export interface FetchAllOptions {
  /** Column to order by so pages are stable. Defaults to the primary key `id`;
   *  tables keyed on student_id (student_engagement, student_dna,
   *  lead_outreach) must say so. */
  orderBy?: string;
  ascending?: boolean;
  pageSize?: number;
  maxPages?: number;
}

export interface FetchAllResult<T> {
  data: T[] | null;
  error: { message: string } | null;
  /** Pages actually fetched — observability for a read that grew. */
  pages: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function fetchAll<T = any>(
  build: () => any,
  opts: FetchAllOptions = {},
): Promise<FetchAllResult<T>> {
  const orderBy = opts.orderBy ?? 'id';
  const ascending = opts.ascending ?? true;
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  const maxPages = opts.maxPages ?? MAX_PAGES;
  if (pageSize < 1 || maxPages < 1) {
    return { data: null, error: { message: 'fetchAll: pageSize and maxPages must be at least 1' }, pages: 0 };
  }

  const out: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    const q = build();
    if (typeof q?.order !== 'function' || typeof q?.range !== 'function') {
      // Not a PostgREST builder. Refuse rather than run a single unbounded
      // read and hand back a capped set as if it were paged.
      return {
        data: null,
        error: { message: 'fetchAll: build() must return a PostgREST query (no order/range on the value returned)' },
        pages: page,
      };
    }
    const from = page * pageSize;
    const { data, error } = await q.order(orderBy, { ascending }).range(from, from + pageSize - 1);
    if (error) return { data: null, error, pages: page + 1 };
    // Same rule as the truth boundary: null data with no error is a request
    // that never completed, not an empty table.
    if (data === null || data === undefined) {
      return { data: null, error: { message: 'fetchAll: no data and no error' }, pages: page + 1 };
    }
    const batch = data as T[];
    out.push(...batch);
    if (batch.length < pageSize) return { data: out, error: null, pages: page + 1 };
  }
  return {
    data: null,
    error: { message: `fetchAll: exceeded ${maxPages} pages (${maxPages * pageSize} rows) — refusing to return a truncated set` },
    pages: maxPages,
  };
}
