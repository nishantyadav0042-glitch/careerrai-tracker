// Shared failed-attempt throttle over the login_attempts table (service-role
// only; RLS denies all client access). Used by the password login AND the
// OTP-verify routes.
//
// The critical property is that the attempt is recorded UP FRONT and the count
// is taken AFTER the insert — so N requests fired in parallel each see each
// other's rows. That closes the check-then-act race where concurrent requests
// all read "count < limit" before any of them recorded a failure and thus all
// slipped through. On a successful auth the key's rows are cleared.
//
// ── SCOPES: WHOSE BUDGET IS BEING SPENT ────────────────────────────────────
//
// The per-IP count is taken WITHIN a scope. Without that, every feature using
// this table shared one IP budget and a row written by one surface silently
// spent another's — /start funnel completions were counting against the LOGIN
// lockout, which on CGNAT (an entire campus behind one exit IP) would lock
// real students out of their own accounts for someone else's traffic.
//
// 'auth' is the default and covers the credential surfaces — login,
// verify-otp, verify-phone-otp. Those three SHARE a pool on purpose: they all
// guess at the same secrets, so spraying across them must not multiply an
// attacker's allowance. A surface that is not a credential attempt passes its
// own scope and gets its own pool.
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

const WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_SCOPE = 'auth';

// Record this attempt, then report whether the caller is now OVER the limit
// (per-key or per-IP) within the rolling window. Call this BEFORE authenticating
// and reject when it returns true. The current attempt is included in the count,
// so `maxPerKey: 5` allows 5 tries and blocks the 6th.
//
// RETURNS TRUE WHEN BLOCKED. Read that twice before wiring it up: a caller that
// inverts it turns its own guard into a permanent outage, which is exactly what
// happened to /api/auth/stash-onboarding (29 Aug) — it answered 429 to every
// request from the first one onward and stored zero drafts in its entire life.
export async function registerAttemptAndCheck(
  admin: Admin,
  key: string,
  ip: string | null,
  opts: { maxPerKey: number; maxPerIp: number; scope?: string }
): Promise<boolean> {
  const scope = opts.scope ?? DEFAULT_SCOPE;
  const { error: insErr } = await admin
    .from('login_attempts')
    .insert({ credential: key, ip, scope });
  if (insErr) {
    // We fail open toward availability (never lock everyone out on a DB blip),
    // but make it LOUD so it can be alerted on — a silently-disabled throttle is
    // exactly the failure mode the audit flagged.
    console.error('[throttle] attempt insert failed:', insErr.message);
  }
  const windowStart = new Date(Date.now() - WINDOW_MS).toISOString();
  const [{ count: byKey }, byIp] = await Promise.all([
    admin.from('login_attempts').select('*', { count: 'exact', head: true })
      .eq('scope', scope).eq('credential', key).gte('created_at', windowStart),
    ip
      ? admin.from('login_attempts').select('*', { count: 'exact', head: true })
          .eq('scope', scope).eq('ip', ip).gte('created_at', windowStart)
      : Promise.resolve({ count: 0 as number | null }),
  ]);
  return (byKey ?? 0) > opts.maxPerKey || (byIp.count ?? 0) > opts.maxPerIp;
}

// Clear a key's attempts after a successful auth so honest users don't carry a
// near-lockout forward. Scoped for the same reason the counts are: clearing
// must not reach into another surface's ledger.
export async function clearAttempts(
  admin: Admin,
  key: string,
  scope: string = DEFAULT_SCOPE,
): Promise<void> {
  const { error } = await admin
    .from('login_attempts').delete().eq('scope', scope).eq('credential', key);
  if (error) console.error('[throttle] clear failed:', error.message);
}
