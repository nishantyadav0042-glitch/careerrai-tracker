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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

const WINDOW_MS = 15 * 60 * 1000;

// Record this attempt, then report whether the caller is now OVER the limit
// (per-key or per-IP) within the rolling window. Call this BEFORE authenticating
// and reject when it returns true. The current attempt is included in the count,
// so `maxPerKey: 5` allows 5 tries and blocks the 6th.
export async function registerAttemptAndCheck(
  admin: Admin,
  key: string,
  ip: string | null,
  opts: { maxPerKey: number; maxPerIp: number }
): Promise<boolean> {
  const { error: insErr } = await admin.from('login_attempts').insert({ credential: key, ip });
  if (insErr) {
    // We fail open toward availability (never lock everyone out on a DB blip),
    // but make it LOUD so it can be alerted on — a silently-disabled throttle is
    // exactly the failure mode the audit flagged.
    console.error('[throttle] attempt insert failed:', insErr.message);
  }
  const windowStart = new Date(Date.now() - WINDOW_MS).toISOString();
  const [{ count: byKey }, byIp] = await Promise.all([
    admin.from('login_attempts').select('*', { count: 'exact', head: true })
      .eq('credential', key).gte('created_at', windowStart),
    ip
      ? admin.from('login_attempts').select('*', { count: 'exact', head: true })
          .eq('ip', ip).gte('created_at', windowStart)
      : Promise.resolve({ count: 0 as number | null }),
  ]);
  return (byKey ?? 0) > opts.maxPerKey || (byIp.count ?? 0) > opts.maxPerIp;
}

// Clear a key's attempts after a successful auth so honest users don't carry a
// near-lockout forward.
export async function clearAttempts(admin: Admin, key: string): Promise<void> {
  const { error } = await admin.from('login_attempts').delete().eq('credential', key);
  if (error) console.error('[throttle] clear failed:', error.message);
}
