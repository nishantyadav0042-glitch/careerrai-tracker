import crypto from 'node:crypto';

// Razorpay via raw HTTP + Node crypto — no npm dependency added. Used only on
// the server (key secret must never reach the client).

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

export async function createRazorpayOrder(
  amountPaise: number,
  receipt: string,
  notes?: Record<string, string>,
): Promise<RazorpayOrder> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error('Razorpay not configured');

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
    body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt, payment_capture: 1, ...(notes ? { notes } : {}) }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Razorpay order failed: ${res.status} ${body}`);
  }
  return res.json() as Promise<RazorpayOrder>;
}

export interface RazorpayPayment {
  id: string;
  status: string;
  amount: number;
}

/**
 * Every payment attempt Razorpay has recorded against an order — the source of
 * truth we reconcile against when a webhook never arrived (see the
 * reconcile-payments cron).
 */
export async function fetchOrderPayments(orderId: string): Promise<RazorpayPayment[]> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error('Razorpay not configured');

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const res = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(orderId)}/payments`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) throw new Error(`Razorpay order payments failed: ${res.status}`);
  const body = (await res.json()) as { items?: RazorpayPayment[] };
  return body.items ?? [];
}

/**
 * Verifies a Razorpay webhook. NEVER trust client-side payment confirmation —
 * subscription state only changes from a signature-verified webhook.
 * Signature = HMAC_SHA256(rawBody, webhookSecret), compared in constant time.
 */
export function verifyCheckoutSignature(
  orderId: string | null | undefined,
  paymentId: string | null | undefined,
  signature: string | null | undefined,
  secret: string,
): boolean {
  if (!orderId || !paymentId || !signature || !secret) return false;
  // Razorpay's checkout-callback signature is a DIFFERENT construction from
  // the webhook's: HMAC_SHA256(order_id + "|" + payment_id) keyed on the API
  // KEY SECRET, not on the webhook secret, and computed over those two fields
  // rather than the raw body. Two verifiers, deliberately, because they verify
  // two different things — collapsing them would mean one secret could forge
  // the other's messages.
  const expected = crypto.createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    // Length mismatch throws rather than returning false — a forged signature
    // of the wrong length must not be an exception, it must be a rejection.
    return false;
  }
}

export function verifyRazorpayWebhook(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}
