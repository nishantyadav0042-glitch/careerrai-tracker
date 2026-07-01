import { NextResponse } from 'next/server';
import { isRequestAdmin } from '@/lib/require-admin';

// Health check for the Razorpay payment gateway. Reports whether the keys are
// configured, valid, and in test/live mode — WITHOUT ever returning the keys.
// Runs on production (where Razorpay is reachable) so we can confirm setup.
export async function GET() {
  if (!(await isRequestAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const enabled = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true';
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const hasWebhookSecret = !!process.env.RAZORPAY_WEBHOOK_SECRET;

  const mode =
    keyId?.startsWith('rzp_live_') ? 'live' :
    keyId?.startsWith('rzp_test_') ? 'test' :
    keyId ? 'unknown' : 'missing';

  // Verify the key/secret pair actually authenticates with Razorpay (read-only —
  // lists at most 1 order, creates nothing).
  let keysValid: boolean | null = null;
  let apiStatus: number | null = null;
  if (keyId && keySecret) {
    try {
      const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
      const res = await fetch('https://api.razorpay.com/v1/orders?count=1', {
        headers: { Authorization: `Basic ${auth}` },
      });
      apiStatus = res.status;
      keysValid = res.ok;
    } catch {
      keysValid = false;
    }
  }

  return NextResponse.json({
    paymentsEnabled: enabled,
    hasKeyId: !!keyId,
    hasKeySecret: !!keySecret,
    hasWebhookSecret,
    mode,
    keysValid,
    apiStatus,
  });
}
