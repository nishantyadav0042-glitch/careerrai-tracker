import { normalizeIndianPhone } from './phone';

// indiahost.org OTP delivery layer.
// Supabase generates and verifies the OTP via the Send SMS auth hook;
// we just hand indiahost the code Supabase produced and ask it to deliver.
//
// Exact API format (from the indiahost panel → "How to setup"):
//   https://otp.indiahost.org/send_otp.php?mobile=+91<10digits>&otp=<otp>&user=<account-email>&key=<key>
// Note: there is NO sender param. The `user` is the indiahost account email.
//
// Setup in Vercel env vars:
//   INDIAHOST_OTP_KEY  — your OTP key from the indiahost panel (required)
//   INDIAHOST_USER     — your indiahost account email (optional; defaults below)
//
// ── 4 Sep incident ────────────────────────────────────────────────────────
// OTP delivery stopped at 09:00 UTC and nobody found out for seven hours. The
// symptom was invisible from our side: Supabase called the hook 18 times, the
// hook returned 200 every time, and not one SMS arrived. 31 requests produced
// exactly one verification attempt.
//
// The reason we could not see it is that this module decided success by
// looking for error WORDS in indiahost's reply:
//
//   if (/(error|failed|invalid|not found|unauthor)/i.test(text) && !/(success|sent|ok)/i.test(text)) throw
//
// Any reply phrased differently — "insufficient balance", "account suspended",
// "quota exceeded", or an empty body — passed straight through as a successful
// send. A denylist of five words was standing between us and a silent outage.
//
// It is now the other way round: the response is always recorded, and anything
// this module cannot positively read as a success is reported rather than
// assumed. We do not yet know indiahost's exact success format, so an
// unrecognised reply is surfaced as UNKNOWN instead of being guessed either
// way — see SendOutcome below.

const DEFAULT_INDIAHOST_USER = 'business@careerrai.com';

/** Never let a full number or a live OTP reach a log line. */
export function maskPhone(e164: string): string {
  return e164.length <= 4 ? '****' : `${e164.slice(0, 3)}****${e164.slice(-4)}`;
}

export function buildIndiahostUrl(e164Phone: string, otp: string): string {
  const key = process.env.INDIAHOST_OTP_KEY;
  if (!key) throw new Error('INDIAHOST_OTP_KEY not set');

  const phone = normalizeIndianPhone(e164Phone);
  if (!phone) throw new Error(`Invalid phone number: ${e164Phone}`);

  const user = process.env.INDIAHOST_USER ?? DEFAULT_INDIAHOST_USER;

  // mobile must be in +91XXXXXXXXXX form (URLSearchParams encodes the + as %2B,
  // which indiahost decodes back to + server-side).
  const url = new URL('https://otp.indiahost.org/send_otp.php');
  url.searchParams.set('mobile', phone);
  url.searchParams.set('otp', otp);
  url.searchParams.set('user', user);
  url.searchParams.set('key', key);
  return url.toString();
}

/**
 * What indiahost's reply told us. `unknown` is a real answer, not a failure to
 * decide: it means the gateway said something this module has never seen, and
 * a human should read `body` before we teach the parser to trust or reject it.
 */
export type SendVerdict = 'sent' | 'rejected' | 'unknown';

export interface SendOutcome {
  verdict: SendVerdict;
  httpStatus: number;
  /** Trimmed reply, capped. Safe to log: contains no OTP and no full number. */
  body: string;
}

// Phrases that positively confirm delivery was accepted.
const SUCCESS = /\b(success|sent|delivered|submitted|accepted|queued)\b|"?status"?\s*[:=]\s*"?(1|true|ok|success)\b/i;

// Phrases that positively confirm it was not. Deliberately wider than the five
// words that let the 4 Sep outage through — every entry after "unauthor" is a
// real gateway failure mode that used to read as success.
const REJECTED =
  /\b(error|failed|failure|invalid|not\s*found|unauthor\w*|denied|reject\w*|block\w*|suspend\w*|expire\w*|insufficient|balance|credit\w*|quota|limit\w*\s*exceed\w*|exceed\w*|inactive|disabled|blacklist\w*|deactivat\w*|not\s*allowed)\b/i;

/**
 * Ask indiahost to deliver `otp` to `e164Phone`.
 *
 * Returns what the gateway said rather than throwing on a bad reply, so the
 * caller can record every outcome — including the ones we cannot classify.
 * A transport failure (network, non-2xx) still throws, because that is not a
 * verdict about delivery, it is the request never landing.
 */
export async function sendOtpSms(e164Phone: string, otp: string): Promise<SendOutcome> {
  const res = await fetch(buildIndiahostUrl(e164Phone, otp), { method: 'GET' });
  const body = (await res.text().catch(() => '')).trim().slice(0, 300);

  if (!res.ok) {
    throw new Error(`indiahost OTP send failed: HTTP ${res.status} ${body.slice(0, 200)}`);
  }

  // Order matters. A reply carrying both — "sent: 0, failed: 1" — is a failure,
  // so rejection is checked first.
  let verdict: SendVerdict = 'unknown';
  if (REJECTED.test(body)) verdict = 'rejected';
  else if (SUCCESS.test(body)) verdict = 'sent';
  else if (body.length === 0) verdict = 'unknown';

  return { verdict, httpStatus: res.status, body };
}
