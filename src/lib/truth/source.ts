// ── The Truth Boundary: a failed read cannot become a student fact ──────────
//
// 23 Aug. The weekly reconciliation read daily_reports for 656 students in one
// request, the request failed, the code destructured `data` without `error`,
// and every student's week became [0,0,0,0,0,0,0]. Fifty-six students who had
// actually studied were told they had studied nothing, and 282 days were added
// to their syllabus dates. The cron logged ok:true.
//
// The bug was not the missing `if (error)`. The bug is that the type system
// allowed a failed read and an empty result to be the same value. Once
// `reports` is `Row[] | null`, `?? []` is the natural thing to write, and every
// reviewer's eye slides over it.
//
// So this module makes the three states irreducible:
//
//   VALUE        we asked, and there is something
//   NO_DATA      we asked, and the answer is genuinely empty
//   UNAVAILABLE  we could not ask, or the answer never arrived
//
// NO_DATA may become zero. UNAVAILABLE may not become anything. There is
// deliberately NO helper on this type that turns UNAVAILABLE into a default —
// no valueOr, no unwrapOr, no toNumber. Adding one would restore the exact
// footgun this exists to remove, which is why a guard test asserts none of
// those names ever appear here.
//
// This is the same rule the payment boundary already runs on, generalised:
// infrastructure failure must never be converted into a negative answer about
// business state. TRUE / FALSE / UNKNOWN-ERROR.

export type Source<T> =
  | { readonly state: 'value'; readonly value: T }
  | { readonly state: 'no_data' }
  | { readonly state: 'unavailable'; readonly reason: string };

export const value = <T>(v: T): Source<T> => ({ state: 'value', value: v });
export const noData = <T>(): Source<T> => ({ state: 'no_data' });
export const unavailable = <T>(reason: string): Source<T> => ({ state: 'unavailable', reason });

/** True when the read completed — whether or not it found anything. Only this
 *  may gate a mutation. */
export function isAnswered<T>(s: Source<T>): s is Extract<Source<T>, { state: 'value' | 'no_data' }> {
  return s.state === 'value' || s.state === 'no_data';
}

export function isUnavailable<T>(s: Source<T>): s is Extract<Source<T>, { state: 'unavailable' }> {
  return s.state === 'unavailable';
}

/** Transform a present value, carrying NO_DATA and UNAVAILABLE through
 *  untouched. A calculation can never resurrect a failed read. */
export function mapSource<A, B>(s: Source<A>, f: (a: A) => B): Source<B> {
  return s.state === 'value' ? value(f(s.value)) : s;
}

/** Collapse several sources into one. If ANY is unavailable the whole thing is
 *  unavailable — a partial picture must never be presented as a total, which
 *  is the aggregate form of the same bug. */
export function allSources<T>(sources: Source<T>[]): Source<T[]> {
  const out: T[] = [];
  let sawValue = false;
  for (const s of sources) {
    if (s.state === 'unavailable') return s;
    if (s.state === 'value') { out.push(s.value); sawValue = true; }
  }
  return sawValue ? value(out) : noData<T[]>();
}

/** The Supabase result shape, narrowed to what matters here. */
export interface QueryResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/**
 * Wrap one Supabase read. This is the ONLY sanctioned way to turn a query into
 * a fact that business logic may use.
 *
 * `data: null` with no error still counts as UNAVAILABLE: the client returns
 * that shape when a request never completed, and treating it as "empty" is
 * precisely how 656 students were recorded as having studied nothing.
 */
export async function readRows<T>(
  label: string,
  run: () => PromiseLike<QueryResult<T>>,
): Promise<Source<T[]>> {
  try {
    const { data, error } = await run();
    if (error) return unavailable<T[]>(`${label}: ${error.message}`);
    if (data === null || data === undefined) return unavailable<T[]>(`${label}: no data and no error`);
    return data.length === 0 ? noData<T[]>() : value(data);
  } catch (e) {
    return unavailable<T[]>(`${label}: ${e instanceof Error ? e.message : 'threw'}`);
  }
}

/** Rows for a read whose empty case is legitimately "nothing to process".
 *  Still refuses to flatten UNAVAILABLE. */
export function rowsOrEmpty<T>(s: Source<T[]>): T[] {
  if (s.state === 'unavailable') {
    throw new Error(`refusing to treat an unavailable read as empty — ${s.reason}`);
  }
  return s.state === 'value' ? s.value : [];
}
