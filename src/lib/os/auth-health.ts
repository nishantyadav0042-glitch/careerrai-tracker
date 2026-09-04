import type { SupabaseClient } from '@supabase/supabase-js';
import type { Exception } from '@/lib/os/exception';

// ── Platform auth health — the alarm that 4 September did not have ──────────
//
// Incident #70 (4 Sep): every OTP request succeeded end to end on our side —
// route 200, GoTrue hook ran, the SMS gateway accepted the send and logged it —
// and not one message reached a handset. Twenty-one students asked for a code,
// zero got in, and nothing told anyone for six hours. The founder found out by
// trying to log in himself.
//
// The reason nothing fired is structural, not incidental: `findSacredFailures`
// only looks at PER-STUDENT states (a paid student stuck after payment, a
// mentor with no room). A student who cannot log in has no state to be stuck
// in — they never become a row. So the one failure that takes the whole
// platform down was the one failure the alert system could not see.
//
// This closes that hole with the only signal that survives a silent provider:
// the OUTCOME. Codes requested is a claim; codes verified is a fact. When the
// funnel asks for codes and nobody ever gets in, delivery is broken — and this
// is true no matter which layer broke, including layers we do not own and
// cannot instrument. That is the point: it does not depend on the gateway
// telling us the truth, because on 4 Sep the gateway said "success" 1,741 times.
//
// It is deliberately an outcome check and not a gateway check. A gateway
// health-check would have been green all through the outage.

/** Rolling window we judge. The cron runs every 15 min; 60 min holds enough signal. */
export const AUTH_WINDOW_MINUTES = 60;

/**
 * Below this many requests in the window, silence means "nobody tried", not
 * "nobody got in" — and paging the founder at 3am because two people were
 * awake and one gave up is how a pager gets muted. 4 Sep had 21 in the window
 * this guards, so the bar is comfortably under a real outage.
 */
export const AUTH_MIN_SAMPLE = 5;

/** A verify rate this far below the ~87% baseline is degraded, not dead. */
export const AUTH_DEGRADED_RATE = 0.25;
export const AUTH_DEGRADED_MIN_SAMPLE = 20;

export interface AuthWindow {
  requested: number;
  verified: number;
  windowMinutes: number;
}

export type AuthVerdict = 'healthy' | 'idle' | 'degraded' | 'outage';

/**
 * Pure classification — the whole judgement, testable without a database.
 *
 * 'idle'     — too few attempts to conclude anything. NOT healthy, and not an
 *              alert either: honest about knowing nothing.
 * 'outage'   — codes were asked for and not one worked. Auth is down.
 * 'degraded' — enough traffic to see a rate, and the rate has collapsed.
 */
export function classifyAuthWindow(w: AuthWindow): AuthVerdict {
  if (w.requested < AUTH_MIN_SAMPLE) return 'idle';
  if (w.verified === 0) return 'outage';
  if (w.requested >= AUTH_DEGRADED_MIN_SAMPLE && w.verified / w.requested < AUTH_DEGRADED_RATE) {
    return 'degraded';
  }
  return 'healthy';
}

/**
 * Build the Exception for a non-healthy window. Returns null when there is
 * nothing to say. One primitive, per SCALE-CONTRACT — no new dashboard, and
 * `destination` drills into the exact events behind the count.
 */
export function authException(w: AuthWindow, nowMs: number): Exception | null {
  const verdict = classifyAuthWindow(w);
  if (verdict === 'healthy' || verdict === 'idle') return null;

  const outage = verdict === 'outage';
  const sinceIso = new Date(nowMs - w.windowMinutes * 60 * 1000).toISOString();

  return {
    // Bucketed to the hour: the same ongoing outage keeps one identity across
    // 15-minute recomputes instead of minting a fresh "new problem" every run.
    id: `auth_${verdict}_${new Date(nowMs).toISOString().slice(0, 13)}`,
    code: outage ? 'auth_otp_outage' : 'auth_otp_degraded',
    domain: 'system',
    // A system-wide fault has no entity id — the contract allows null here.
    entity: { kind: 'platform', id: null, label: 'Phone OTP login' },
    severity: outage ? 'critical' : 'high',
    reason: outage
      ? `${w.requested} students asked for a login code in the last ${w.windowMinutes} minutes and not one of them got in. Nobody can sign in.`
      : `Only ${w.verified} of ${w.requested} login codes worked in the last ${w.windowMinutes} minutes (${Math.round((w.verified / w.requested) * 100)}%). Normal is around 87%.`,
    detectedAtMs: nowMs,
    evidence: {
      requested: w.requested,
      verified: w.verified,
      windowMinutes: w.windowMinutes,
      since: sinceIso,
      // Named so the first person reading the page knows where to start, and
      // does not spend the first hour re-deriving Incident #70's boundary.
      firstCheck: 'Vercel logs for [sms-hook] verdict, then the SMS gateway send log',
    },
    suggestedAction: {
      label: 'Open the auth funnel',
      route: '/admin/analytics?funnel=auth',
    },
    // Nothing self-heals a broken SMS route; saying otherwise would be a lie
    // the founder would act on.
    recovery: { attempted: false, status: 'none' },
    owner: 'founder',
    destination: `/admin/analytics?funnel=auth&since=${encodeURIComponent(sinceIso)}`,
    lifecycle: 'detected',
  };
}

/** Read the window from telemetry. Counts only — no student rows are loaded. */
export async function readAuthWindow(
  admin: SupabaseClient,
  nowMs: number,
  windowMinutes = AUTH_WINDOW_MINUTES,
): Promise<AuthWindow> {
  const since = new Date(nowMs - windowMinutes * 60 * 1000).toISOString();
  const count = async (events: string[]) => {
    const { count: n } = await admin
      .from('student_events')
      .select('*', { count: 'exact', head: true })
      .in('event', events)
      .gte('created_at', since);
    return n ?? 0;
  };
  // A resend is still a student waiting for a code, so it counts as asking.
  const [requested, verified] = await Promise.all([
    count(['auth_otp_requested', 'auth_otp_resent']),
    count(['auth_otp_verified']),
  ]);
  return { requested, verified, windowMinutes };
}

/** The producer the founder-alert cron calls. Null = nothing to escalate. */
export async function findAuthOutage(admin: SupabaseClient, nowMs: number): Promise<Exception | null> {
  return authException(await readAuthWindow(admin, nowMs), nowMs);
}
