import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { sendOtpSms } from '@/lib/indiahost-otp';

// Supabase "Send SMS" Auth Hook → us → indiahost.
//
// Supabase signs each request with the Standard Webhooks scheme
// (webhook-id / webhook-timestamp / webhook-signature headers), using the
// secret configured in the Supabase dashboard:
//   Auth → Hooks → Send SMS hook → (HTTPS) → Secret = v1,whsec_...
//
// That SAME secret goes into SEND_SMS_HOOK_SECRET on Vercel so we can verify
// the signature. If SEND_SMS_HOOK_SECRET is absent we skip verification and
// still deliver — useful while the env var is being rolled out to a project.

function verifyStandardWebhooksSignature(rawBody: string, headers: Headers, secret: string): boolean {
  const id = headers.get('webhook-id');
  const timestamp = headers.get('webhook-timestamp');
  const signatureHeader = headers.get('webhook-signature');
  if (!id || !timestamp || !signatureHeader) return false;

  const base = secret.replace(/^v1,whsec_/, '').replace(/^whsec_/, '');
  let secretBytes: Buffer;
  try {
    secretBytes = Buffer.from(base, 'base64');
  } catch {
    return false;
  }
  const expected = crypto
    .createHmac('sha256', secretBytes)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('base64');

  // Header is a space-separated list of "v1,<sig>" entries.
  return signatureHeader
    .split(' ')
    .map((part) => (part.includes(',') ? part.split(',')[1] : part))
    .some((sig) => {
      try {
        return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
      } catch {
        return false;
      }
    });
}

export async function POST(request: NextRequest) {
  const secret = process.env.SEND_SMS_HOOK_SECRET;
  const raw = await request.text();

  if (secret) {
    // Signature verification is configured — enforce it.
    if (!verifyStandardWebhooksSignature(raw, request.headers, secret)) {
      console.error('[sms-hook] signature verification failed');
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
    }
  } else {
    console.warn('[sms-hook] SEND_SMS_HOOK_SECRET not set — skipping signature check');
  }

  try {
    const payload = JSON.parse(raw) as { user?: { phone?: string }; sms?: { otp?: string } };
    const phone = payload.user?.phone;
    const otp = payload.sms?.otp;

    if (!phone || !otp) {
      console.error('[sms-hook] missing phone or otp in payload', { phone: !!phone, otp: !!otp });
      return NextResponse.json({ error: 'missing phone or otp' }, { status: 400 });
    }

    await sendOtpSms(phone, otp);
    return NextResponse.json({});
  } catch (e) {
    console.error('[sms-hook] delivery error', e);
    return NextResponse.json({ error: 'send failed' }, { status: 500 });
  }
}
