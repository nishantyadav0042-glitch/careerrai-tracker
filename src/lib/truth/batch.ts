// ── Batched reads that stay correct as the student base grows ───────────────
//
// The 23 Aug incident had a second half. The reconciliation did this:
//
//     .in('student_id', ids)      // 656 UUIDs
//
// which puts every student in the REQUEST URL. At 656 students that is roughly
// 24KB of query string. Only 146 rows existed for the week, so the response was
// never the problem — the request was. The audit found 56 more call sites with
// the same shape and not one of them chunked or paginated.
//
// A limit raise would only move the cliff. This chunks by a fixed id count, so
// request size is bounded by CHUNK_SIZE and NOT by the population: 656 students
// and 50,000 students both produce requests of the same maximum size, just more
// of them.
//
// The other half of the rule matters more. If any chunk fails, the whole read
// is UNAVAILABLE. Returning the chunks that did succeed would hand business
// logic a smaller-but-plausible dataset — a partial week that looks exactly
// like a real week with fewer study hours in it. That is the same falsehood as
// before, wearing better clothes.

import { type Source, unavailable, value, noData, readRows } from './source';

/**
 * Ids per request. A UUID plus its separator is ~37 characters, so 100 ids is
 * roughly 3.7KB of query string — comfortably inside the ~8KB that proxies and
 * gateways commonly accept, with room for the rest of the URL.
 *
 * This is a CEILING, not a tuning knob: raising it trades the safety margin
 * that this whole module exists to provide.
 */
export const CHUNK_SIZE = 100;

export function chunkIds<T>(ids: readonly T[], size: number = CHUNK_SIZE): T[][] {
  if (size < 1) throw new Error('chunk size must be at least 1');
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

/**
 * Read rows for many ids without ever putting all of them in one request.
 *
 * ALL chunks succeed        -> VALUE (or NO_DATA when every chunk was empty)
 * ANY chunk is unavailable  -> UNAVAILABLE for the whole read
 *
 * Chunks run sequentially on purpose: a cron that fans 500 concurrent requests
 * at the database to save a few seconds is how a reconciliation job becomes an
 * outage. Correctness first; these jobs run once a week.
 */
export async function readRowsForIds<Id, Row>(
  label: string,
  ids: readonly Id[],
  run: (chunk: Id[]) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>,
  size: number = CHUNK_SIZE,
): Promise<Source<Row[]>> {
  if (ids.length === 0) return noData<Row[]>();

  const out: Row[] = [];
  let found = false;
  const chunks = chunkIds(ids, size);

  for (let i = 0; i < chunks.length; i++) {
    const res = await readRows<Row>(`${label} [chunk ${i + 1}/${chunks.length}]`, () => run(chunks[i]));
    if (res.state === 'unavailable') {
      // Deliberately abandons the rows already collected. A caller that wanted
      // them would be reasoning about a fraction of the truth.
      return unavailable<Row[]>(res.reason);
    }
    if (res.state === 'value') { out.push(...res.value); found = true; }
  }

  return found ? value(out) : noData<Row[]>();
}
