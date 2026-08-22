// ── Telling "no session" apart from "we could not ask" ──────────────────────
//
// supabase.auth.getUser() does NOT throw for auth failures. It resolves as
// `{ data: { user: null }, error }`, and the middleware's try/catch therefore
// only ever saw genuine network throws — every other failure arrived as a
// plain `user = null`, indistinguishable from a visitor who simply is not
// logged in. A GoTrue 500, a timeout, a rate-limited auth service: all of them
// silently became "you are logged out", and a student mid-session was sent to
// /login with a session that was still perfectly valid.
//
// That is the Boundary-2 rule again, in a new place: an infrastructure failure
// must never be converted into a negative answer about state. TRUE / FALSE /
// UNKNOWN — and "we could not reach the auth service" is UNKNOWN, not FALSE.
//
// Classification is by error SHAPE, not by importing auth-js internals: a deep
// import into the library's error classes would tie this file to a private
// path that can move in any patch release.

/** Auth errors carry a name and (usually) an HTTP status. */
export interface AuthErrorLike {
  name?: string;
  status?: number | null;
  message?: string;
}

export type AuthOutcome =
  /** A real, verified user. */
  | 'authenticated'
  /** Genuinely not logged in — no cookies, or credentials the server rejected. */
  | 'no-session'
  /** We could not get an answer. NOT a logout. */
  | 'infrastructure';

/** auth-js's own name for a transient fetch failure. */
const RETRYABLE_NAME = 'AuthRetryableFetchError';

export function classifyAuth(
  user: unknown,
  error: AuthErrorLike | null | undefined,
): AuthOutcome {
  if (user) return 'authenticated';

  // No user and no error is the ordinary logged-out visitor: the request
  // simply carried no usable auth cookie. This is the common case and must
  // stay cheap and unambiguous.
  if (!error) return 'no-session';

  if (error.name === RETRYABLE_NAME) return 'infrastructure';

  const status = error.status;
  // A thrown network error has no status at all. Treating "no status" as a
  // rejected credential is exactly the bug this function exists to prevent.
  if (status === null || status === undefined) return 'infrastructure';
  // 5xx is the auth service failing, not the student's session failing.
  if (status >= 500) return 'infrastructure';
  // 429: we were throttled. Nothing was decided about this session.
  if (status === 429) return 'infrastructure';

  // Everything else (400 invalid/missing session, 401, 403) is a real answer:
  // the credential was seen and rejected.
  return 'no-session';
}

/** True when it is worth asking again — the only case a retry can improve. */
export function shouldRetryAuth(outcome: AuthOutcome): boolean {
  return outcome === 'infrastructure';
}

/** How many times the middleware will ask. One retry: enough to ride out a
 *  blip, few enough that a genuinely dead auth service does not multiply
 *  every protected request into a queue of doomed round-trips. */
export const MAX_AUTH_ATTEMPTS = 2;

export interface AuthLookup {
  user: unknown;
  error?: AuthErrorLike | null;
}

/** The retry loop, extracted so it can be tested without an edge runtime or a
 *  live Supabase. Retries ONLY an undetermined outcome, because that is the
 *  only case another attempt can improve: a rejected credential rejects again,
 *  and a valid user is already the answer. */
export async function resolveAuthWithRetry(
  lookup: () => Promise<AuthLookup>,
  maxAttempts: number = MAX_AUTH_ATTEMPTS,
): Promise<{ user: unknown; outcome: AuthOutcome; attempts: number }> {
  let user: unknown = null;
  let outcome: AuthOutcome = 'no-session';
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts += 1;
    try {
      const res = await lookup();
      user = res.user;
      outcome = classifyAuth(res.user, res.error);
    } catch (err) {
      user = null;
      outcome = classifyAuth(null, err as AuthErrorLike);
    }
    if (!shouldRetryAuth(outcome)) break;
  }

  return { user, outcome, attempts };
}
