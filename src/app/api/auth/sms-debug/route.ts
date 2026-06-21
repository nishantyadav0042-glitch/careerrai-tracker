import { NextRequest, NextResponse } from 'next/server';
import { normalizeIndianPhone } from '@/lib/phone';

// TEMPORARY founder-only debug endpoint for diagnosing indiahost SMS delivery.
// Gated by the OTP key itself (only the founder knows it). Returns the RAW
// indiahost request + response so we can see exactly why a send is rejected.
//
// Usage: /api/auth/sms-debug?phone=9876543210&token=<INDIAHOST_OTP_KEY>&sender=OPTIONAL
//
// DELETE THIS ROUTE once OTP delivery is confirmed working.
export async function GET(request: NextRequest) {
  const key = process.env.INDIAHOST_OTP_KEY;
  const params = request.nextUrl.searchParams;
  const token = params.get('token');

  if (!key) {
    return NextResponse.json({ ok: false, error: 'INDIAHOST_OTP_KEY not set in this deployment' }, { status: 500 });
  }
  if (!token || token !== key) {
    return NextResponse.json({ ok: false, error: 'Unauthorized — token must equal INDIAHOST_OTP_KEY' }, { status: 401 });
  }

  const rawPhone = params.get('phone') ?? '';
  const e164 = normalizeIndianPhone(rawPhone);
  if (!e164) {
    return NextResponse.json({ ok: false, error: 'Invalid phone — pass ?phone=<10 digit Indian mobile>' }, { status: 400 });
  }
  const mobile = e164.replace(/^\+/, '');
  const sender = params.get('sender') ?? process.env.INDIAHOST_SENDER ?? 'OTPSMS';
  const otp = '123456';

  const url = new URL('https://otp.indiahost.org/api/send');
  url.searchParams.set('key', key);
  url.searchParams.set('mobile', mobile);
  url.searchParams.set('otp', otp);
  url.searchParams.set('sender', sender);

  // Redacted URL for display (hide the key)
  const redactedUrl = url.toString().replace(encodeURIComponent(key), '***').replace(key, '***');

  try {
    const res = await fetch(url.toString(), { method: 'GET' });
    const body = await res.text().catch(() => '');
    return NextResponse.json({
      ok: res.ok,
      requestUrl: redactedUrl,
      sender,
      mobile,
      httpStatus: res.status,
      responseBody: body,
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      requestUrl: redactedUrl,
      sender,
      mobile,
      fetchError: e instanceof Error ? e.message : String(e),
    }, { status: 502 });
  }
}
