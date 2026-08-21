// ── Track B instrumentation (founder GO, 21 Aug) — observation ONLY ─────────
//
// The forced-relogin forensic proved the terminal state: at the forced login,
// ONLY the sb-* auth cookies are gone while small cookies in the same jar
// survive, with zero server-side auth activity. What it could not see is the
// client's cookie state at that exact moment. These helpers produce the two
// log payloads that close that gap:
//
//   · auth-loss-observation — a protected request arrived with NO user: did it
//     carry sb-* cookies (present-but-invalid state) or none at all (evicted)?
//   · auth-cookie-removal  — this response is DELETING sb-* cookies: the
//     silent _removeSession → maxAge=0 path, caught in the act.
//
// PROHIBITED in these payloads, permanently (founder rule): cookie values,
// access tokens, refresh tokens, Authorization headers, the full Cookie
// header, and phone/email/user identifiers. Names and byte-lengths only —
// the test file plants a secret in a cookie value and asserts it can never
// reach the serialized output.

export interface CookieLike {
  name: string;
  value: string;
}

/** sb-* cookie names + byte lengths ONLY — never values. An empty `names`
 *  array IS the finding: the jar arrived with no auth cookies at all. */
export function describeSbCookies(cookies: CookieLike[]): { names: string[]; bytes: number[] } {
  const sb = cookies.filter((c) => c.name.startsWith('sb-'));
  return {
    names: sb.map((c) => c.name),
    bytes: sb.map((c) => c.value.length),
  };
}

/** Names of the sb-* cookies a response is REMOVING (maxAge 0 or emptied) —
 *  the deletion mechanism's signature, without ever touching a value. */
export function sbRemovalNames(
  cookies: { name: string; value: string; maxAge?: number }[],
): string[] {
  return cookies
    .filter((c) => c.name.startsWith('sb-') && (c.maxAge === 0 || c.value === ''))
    .map((c) => c.name);
}
