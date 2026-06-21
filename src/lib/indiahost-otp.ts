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

const DEFAULT_INDIAHOST_USER = 'business@careerrai.com';

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

export async function sendOtpSms(e164Phone: string, otp: string): Promise<void> {
  const res = await fetch(buildIndiahostUrl(e164Phone, otp), { method: 'GET' });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`indiahost OTP send failed: HTTP ${res.status} ${body.slice(0, 200)}`);
  }

  const text = await res.text().catch(() => '');
  // Only treat a response as failure when it clearly signals an error and shows
  // no success marker — avoids false negatives breaking an otherwise-good send.
  if (/\b(error|failed|invalid|not\s*found|unauthor)/i.test(text) && !/\b(success|sent|ok|true|delivered)\b/i.test(text)) {
    throw new Error(`indiahost OTP error: ${text.slice(0, 200)}`);
  }
}
