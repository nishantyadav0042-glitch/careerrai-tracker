import { NextRequest, NextResponse } from 'next/server';
import { normalizeIndianPhone } from '@/lib/phone';
import { buildIndiahostUrl } from '@/lib/indiahost-otp';

// TEMPORARY founder-only debug endpoint for diagnosing indiahost SMS delivery.
// Gated by the OTP key itself (only the founder knows it). Returns the RAW
// indiahost request + response so we can see exactly what indiahost says.
//
// Usage: /api/auth/sms-debug?phone=9876543210&token=<INDIAHOST_OTP_KEY>
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

  const e164 = normalizeIndianPhone(params.get('phone') ?? '');
  if (!e164) {
    return NextResponse.json({ ok: false, error: 'Invalid phone — pass ?phone=<10 digit Indian mobile>' }, { status: 400 });
  }

  const otp = '123456';
  let url: string;
  try {
    url = buildIndiahostUrl(e164, otp);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
  const redactedUrl = url.replace(encodeURIComponent(key), '***').replace(key, '***');

  try {
    const res = await fetch(url, { method: 'GET' });
    const body = await res.text().catch(() => '');
    return NextResponse.json({
      ok: res.ok,
      requestUrl: redactedUrl,
      httpStatus: res.status,
      responseBody: body.slice(0, 1000),
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      requestUrl: redactedUrl,
      fetchError: e instanceof Error ? e.message : String(e),
    }, { status: 502 });
  }
}
