import { toMsg91Mobile } from './phone';

// MSG91 is the SMS DELIVERY layer only. Supabase generates and verifies the OTP
// natively (Send-SMS auth hook) — we just hand MSG91 the code Supabase produced
// and ask it to deliver via a DLT-approved template.
//
// Cost note: MSG91's startup tier covers early volume; the request-otp route
// rate-limits sends (3 / 30min, 30s cooldown) so a bad actor can't burn credits.
//
// Founder setup (see SETUP.md): MSG91_AUTH_KEY, MSG91_OTP_TEMPLATE_ID,
// MSG91_SENDER_ID, plus a DLT-registered sender + approved template whose single
// variable carries the code (mapped below as var1 / otp).
export async function sendOtpSms(e164Phone: string, otp: string): Promise<void> {
  const authKey = process.env.MSG91_AUTH_KEY;
  const templateId = process.env.MSG91_OTP_TEMPLATE_ID;
  const sender = process.env.MSG91_SENDER_ID;
  if (!authKey || !templateId) {
    throw new Error('MSG91 not configured (MSG91_AUTH_KEY / MSG91_OTP_TEMPLATE_ID missing)');
  }

  const res = await fetch('https://control.msg91.com/api/v5/flow/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authkey: authKey },
    body: JSON.stringify({
      template_id: templateId,
      sender,
      short_url: '0',
      // var1 and otp both set so the template variable name can be either.
      recipients: [{ mobiles: toMsg91Mobile(e164Phone), var1: otp, otp }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`MSG91 send failed: ${res.status} ${body}`);
  }
  const data = (await res.json().catch(() => null)) as { type?: string; message?: string } | null;
  if (data?.type === 'error') {
    throw new Error(`MSG91 error: ${data.message ?? 'unknown'}`);
  }
}
