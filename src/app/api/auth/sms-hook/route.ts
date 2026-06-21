import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { sendOtpSms } from '@/lib/indiahost-otp';

// Supabase "Send SMS" Auth Hook → us → MSG91.
// Supabase signs the payload (Standard Webhooks). We verify before delivering so
// nobody can drive MSG91 sends by POSTing here directly.
// Founder configures the hook URL + SEND_SMS_HOOK_SECRET in the Supabase dashboard.
function verifySignature(rawBody: string, headers: Headers, secret: string): boolean {
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
    if (!verifySignature(raw, request.headers, secret)) {
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
    }
  } else {
    // Secret not configured — allow but warn. Set SEND_SMS_HOOK_SECRET in Vercel to lock this down.
    console.warn('[sms-hook] SEND_SMS_HOOK_SECRET not set; skipping signature verification');
  }

  try {
    const payload = JSON.parse(raw) as { user?: { phone?: string }; sms?: { otp?: string } };
    const phone = payload.user?.phone;
    const otp = payload.sms?.otp;
    if (!phone || !otp) {
      return NextResponse.json({ error: 'missing phone or otp' }, { status: 400 });
    }
    await sendOtpSms(phone, otp);
    return NextResponse.json({});
  } catch (e) {
    console.error('[sms-hook] delivery error', e);
    return NextResponse.json({ error: 'send failed' }, { status: 500 });
  }
}
