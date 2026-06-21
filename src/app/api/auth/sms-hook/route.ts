import { NextRequest, NextResponse } from 'next/server';
import { sendOtpSms } from '@/lib/indiahost-otp';

// Supabase "Send SMS" Auth Hook → us → indiahost.
//
// Setup in Supabase dashboard:
//   Auth → Hooks → Send SMS → HTTP URL → set to:
//     https://<your-domain>/api/auth/sms-hook
//   Authorization Header → Bearer → paste any secret string you choose
//
// Setup in Vercel (optional but recommended):
//   SEND_SMS_HOOK_SECRET = that same secret string
//
// If SEND_SMS_HOOK_SECRET is absent the hook still runs — useful when the
// env var hasn't been added to all Vercel projects yet.

export async function POST(request: NextRequest) {
  const secret = process.env.SEND_SMS_HOOK_SECRET;

  if (secret) {
    // Verify Bearer token when the secret is configured.
    const authHeader = request.headers.get('authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    if (token !== secret) {
      console.error('[sms-hook] invalid bearer token');
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  } else {
    console.warn('[sms-hook] SEND_SMS_HOOK_SECRET not set — skipping auth check');
  }

  try {
    const raw = await request.text();
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
