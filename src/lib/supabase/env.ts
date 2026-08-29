// ── THE SUPABASE CREDENTIALS, CLEANED ONCE ──────────────────────────────────
//
// 29 Aug. Production's NEXT_PUBLIC_SUPABASE_URL carried a leading U+FEFF — a
// byte-order mark, invisible in every dashboard and every log line, almost
// certainly pasted in from a file or a doc. It is not whitespace, so nothing
// trims it, and it survives every copy.
//
// What it does is silent and total: `new URL()` rejects the string outright.
// Node's fetch threw "Failed to parse URL from ￼https://…" on a value that
// reads as a perfectly ordinary URL in any editor. Anything deriving a storage
// key or an endpoint from it is working with a string that is one invisible
// character away from the one it appears to be — and the two sides of a PKCE
// exchange only have to disagree once for a sign-in to fail with a message
// about "storage" that says nothing about a URL.
//
// So the value is cleaned in exactly one place and every caller reads it from
// here. Stripping is deliberately narrow: BOM, zero-width space, and
// surrounding whitespace — the characters a paste adds. Nothing else is
// touched, because a URL that is wrong in any other way should fail loudly
// rather than be silently rewritten into something that works.
//
// The literal `process.env.NEXT_PUBLIC_*` member expressions must stay exactly
// as written: Next.js substitutes them textually at build time, so a computed
// lookup would leave the client bundle with undefined.

/** BOM, zero-width space, and surrounding whitespace — what a paste adds. */
const clean = (raw: string | undefined): string =>
  (raw ?? '').replace(/^[﻿​\s]+/, '').replace(/[﻿​\s]+$/, '');

// FUNCTIONS, NOT CONSTANTS, and the distinction is load-bearing. A `const`
// here is evaluated when this module is first imported, which on the server is
// before anything that sets process.env in a test — and it silently captured
// empty strings, which oauth-callback-routing.guard caught immediately. Reading
// per call keeps the exact timing every caller had before this module existed.

/** Project URL, with any trailing slash removed so `${url()}/auth/v1/…` is safe. */
export function supabaseUrl(): string {
  return clean(process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/, '');
}

/** Anon key. Public by design — it is shipped to every browser. */
export function supabaseAnonKey(): string {
  return clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * True when the configured URL is actually parseable. Callers that report
 * health can surface this instead of discovering it as a thrown fetch.
 */
export function supabaseUrlIsValid(): boolean {
  try { new URL(supabaseUrl()); return true; } catch { return false; }
}
