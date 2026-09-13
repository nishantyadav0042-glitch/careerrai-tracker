// ── A write that never reached the server is not a failed write ─────────────
//
// `fetch` RESOLVES on 400/404/500 and only REJECTS on a network fault. Those
// two are completely different events and must never be treated alike:
//
//   arrived and was refused  → the server said no. Retrying says no again.
//   never arrived            → nobody said anything. Retrying usually works.
//
// supabase-js already draws this line for us, though it is easy to miss.
// postgrest-js catches the rejected fetch and hands back a NORMAL-looking
// result whose `error.message` is `${err.name}: ${err.message}` — on iOS
// Safari that is the string "TypeError: Load failed" — and, crucially,
// `status: 0`. The status is the reliable signal; the message is not, because
// every engine words it differently:
//
//   Safari / WebKit  "TypeError: Load failed"
//   Chrome / Blink   "TypeError: Failed to fetch"
//   Firefox / Gecko  "TypeError: NetworkError when attempting to fetch resource."
//
// So we branch on `status === 0` and never on the text. (Verified against
// @supabase/postgrest-js 2.108.0, dist/index.mjs — the fetch-rejection path
// returns status 0, statusText '', and an empty `code`.)
//
// WHY THIS FILE EXISTS (13 Sep 2026). A student on an iPhone reached the last
// screen of the Blueprint Builder, tapped to lock his finish date, and was
// shown a red box reading "TypeError: Load failed" — a browser's internal
// error name, rendered verbatim into the one flow that decides whether a
// student ever becomes a student. He reloaded and got through; we only heard
// about it because a counsellor forwarded a screenshot. `plan-card:tick`
// already noted 70 "Load failed" rows since 26 July, so this is the common
// condition of a phone on Indian mobile data, not an exotic one.
//
// A momentary radio drop should cost a student nothing. Retrying is safe here
// because every caller is IDEMPOTENT — setting known columns on one row keyed
// by id. Re-running it lands the same row in the same state.

/** The shape every postgrest write/read result shares that we care about. */
export interface WriteOutcome {
  error: unknown | null;
  status?: number | null;
}

/**
 * Did this request fail to reach the server at all?
 *
 * `status === 0` is postgrest-js's signal for a rejected fetch — DNS failure,
 * radio drop, TLS abort, the tab suspended mid-flight. Anything else that
 * carries an error arrived and was answered, and is the server's verdict.
 */
export function isNetworkFailure(outcome: WriteOutcome): boolean {
  return !!outcome.error && outcome.status === 0;
}

/**
 * What a student is allowed to read when a write never arrived.
 *
 * Never the driver's message. "TypeError: Load failed" tells a 20-year-old
 * with a weak signal nothing they can act on, and reads like the product
 * broke rather than the connection. This says what happened, what to do, and
 * — the part that actually matters — that their work is safe.
 */
export const NETWORK_WRITE_MESSAGE =
  "Couldn't reach CareerRai just then — check your connection and tap again. Your answers are saved.";

export interface RetryOptions {
  /** Total attempts including the first. Default 3. */
  attempts?: number;
  /** Backoff before attempt n (1-indexed gap). Default 400ms, 1200ms. */
  delaysMs?: readonly number[];
  /** Injected for tests so the suite never actually waits. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Run an idempotent postgrest write, retrying ONLY when it never reached the
 * server. A refusal (403, a constraint violation, a bad column) is returned
 * on the first attempt untouched — retrying a verdict just makes the student
 * wait longer to read the same thing.
 *
 * Returns the last outcome either way; the caller decides what to render.
 * Deliberately bounded: two extra tries and ~1.6s of waiting is the most a
 * student should ever spend not knowing whether their tap worked.
 */
export async function retryOnNetworkFailure<T extends WriteOutcome>(
  run: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const attempts = Math.max(1, opts.attempts ?? 3);
  const delays = opts.delaysMs ?? [400, 1200];
  const sleep = opts.sleep ?? defaultSleep;

  let outcome = await run();
  for (let attempt = 1; attempt < attempts; attempt++) {
    if (!isNetworkFailure(outcome)) return outcome;
    await sleep(delays[attempt - 1] ?? delays[delays.length - 1] ?? 400);
    outcome = await run();
  }
  return outcome;
}

/**
 * The same rule for a bare `fetch`, which draws the line differently: it
 * RESOLVES on 400/404/500 and only REJECTS when the request never arrived.
 * So here the rejection IS the signal, and a resolved Response — whatever its
 * status — is the server's answer and comes straight back to the caller.
 *
 * Rethrows the last rejection once the attempts are spent, so the caller's
 * catch still runs; it just runs after we have genuinely tried.
 */
export async function retryFetch(
  run: () => Promise<Response>,
  opts: RetryOptions = {},
): Promise<Response> {
  const attempts = Math.max(1, opts.attempts ?? 3);
  const delays = opts.delaysMs ?? [400, 1200];
  const sleep = opts.sleep ?? defaultSleep;

  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await sleep(delays[attempt - 1] ?? delays[delays.length - 1] ?? 400);
    try {
      return await run();
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}
