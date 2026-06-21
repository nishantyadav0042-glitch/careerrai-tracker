import { normalizeIndianPhone } from './phone';

// indiahost.org OTP delivery layer.
// Supabase generates and verifies the OTP via the Send SMS auth hook;
// we just hand indiahost the code Supabase produced and ask it to deliver.
//
// Setup in Vercel env vars:
//   INDIAHOST_OTP_KEY  — your OTP key from the indiahost panel
//   INDIAHOST_SENDER   — sender ID (optional, defaults to OTPSMS)
//
// Setup in Supabase Dashboard:
//   Authentication → Hooks → Send SMS → URL = https://<your-domain>/api/auth/sms-hook
//   Set SEND_SMS_HOOK_SECRET to the hook secret shown in the dashboard.

export async function sendOtpSms(e164Phone: string, otp: string): Promise<void> {
  const key = process.env.INDIAHOST_OTP_KEY;
  const sender = process.env.INDIAHOST_SENDER ?? 'OTPSMS';
  if (!key) {
    throw new Error('INDIAHOST_OTP_KEY not set');
  }

  // Strip leading + so the mobile number is plain digits (e.g. 919876543210)
  const phone = normalizeIndianPhone(e164Phone);
  if (!phone) throw new Error(`Invalid phone number: ${e164Phone}`);
  const mobile = phone.replace(/^\+/, '');

  // indiahost.org OTP send API
  const url = new URL('https://otp.indiahost.org/api/send');
  url.searchParams.set('key', key);
  url.searchParams.set('mobile', mobile);
  url.searchParams.set('otp', otp);
  url.searchParams.set('sender', sender);

  const res = await fetch(url.toString(), { method: 'GET' });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`indiahost OTP send failed: ${res.status} ${body}`);
  }

  const text = await res.text().catch(() => '');
  // indiahost returns error codes as plain text or JSON; treat non-success strings as errors
  if (/error|fail|invalid/i.test(text) && !/success|sent|ok/i.test(text)) {
    throw new Error(`indiahost OTP error: ${text}`);
  }
}
