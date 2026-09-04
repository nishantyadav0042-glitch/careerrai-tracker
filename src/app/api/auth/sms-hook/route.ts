import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { sendOtpSms, maskPhone } from '@/lib/indiahost-otp';

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

  // Signature verification is always required. A missing secret is a
  // misconfiguration — reject rather than silently becoming an open SMS relay.
  if (!secret) {
    console.error('[sms-hook] SEND_SMS_HOOK_SECRET not configured — rejecting request');
    return NextResponse.json({ error: 'misconfigured' }, { status: 500 });
  }

  if (!verifyStandardWebhooksSignature(raw, request.headers, secret)) {
    console.error('[sms-hook] signature verification failed');
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  try {
    const payload = JSON.parse(raw) as { user?: { phone?: string }; sms?: { otp?: string } };
    const phone = payload.user?.phone;
    const otp = payload.sms?.otp;

    if (!phone || !otp) {
      console.error('[sms-hook] missing phone or otp in payload', { phone: !!phone, otp: !!otp });
      return NextResponse.json({ error: 'missing phone or otp' }, { status: 400 });
    }

    const outcome = await sendOtpSms(phone, otp);

    // Every send is recorded, whatever happened. On 4 Sep this hook returned
    // 200 eighteen times while nothing was delivered, and the logs held not one
    // line to say so — the gateway's own reply was read and thrown away. It is
    // kept now. The line carries a masked number and the reply text; never the
    // OTP, and never the full number.
    const line = `[sms-hook] indiahost verdict=${outcome.verdict} http=${outcome.httpStatus} to=${maskPhone(phone)} body=${JSON.stringify(outcome.body)}`;

    if (outcome.verdict === 'rejected') {
      // The gateway said no. Returning 200 here is what let a silent outage
      // run for seven hours: Supabase marks the code as delivered, the student
      // waits for an SMS that was never accepted, and the retry burns another.
      // A 500 makes Supabase surface the failure instead of hiding it.
      console.error(line);
      return NextResponse.json({ error: 'gateway rejected' }, { status: 500 });
    }

    if (outcome.verdict === 'unknown') {
      // Deliberately NOT treated as failure. We do not yet know indiahost's
      // success format, and guessing wrong in this direction would break
      // working sign-ins for everyone. It is logged at error level so it is
      // impossible to miss, and the body is right there to read: once a real
      // reply has been seen, teach SUCCESS or REJECTED in indiahost-otp.ts and
      // this branch stops firing.
      console.error(`${line} (unrecognised reply — classify it in indiahost-otp.ts)`);
      return NextResponse.json({});
    }

    console.log(line);
    return NextResponse.json({});
  } catch (e) {
    console.error('[sms-hook] delivery error', e);
    return NextResponse.json({ error: 'send failed' }, { status: 500 });
  }
}
