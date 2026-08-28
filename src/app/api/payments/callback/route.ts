import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCheckoutSignature } from '@/lib/razorpay';
import { readWebhookPaymentRow, activatePaidOrder, mayActivatePayment } from '@/lib/activate-payment';
import { paymentReturnPath } from '@/lib/payment-return';
import { emitPaymentFunnel } from '@/lib/payment-funnel';

// ── THE RETURN LEG OF REDIRECT CHECKOUT ─────────────────────────────────────
//
// THE BUG THIS FIXES. Redirect checkout shipped on 25 Aug pointing its
// `callback_url` at `/student/profile` and `/student/buddy` — Next.js PAGE
// routes. Razorpay's redirect flow does not GET that URL, it **POSTs** the
// result to it (razorpay_payment_id, razorpay_order_id, razorpay_signature as
// form fields). An App Router page serves GET only, and Next returns
// `405 Method Not Allowed` for any other method.
//
// So the flow was: tap → Razorpay opens → student pays → **405 error page**.
// The one screen a paying student must never see is an error, and they saw it
// at the exact moment their money left. The webhook still activated them in
// the background, which is why nothing looked broken in the ledger: the money
// arrived, the entitlement arrived, and only the human was left staring at a
// failure.
//
// It could not be fixed where it broke, either: Next forbids a `route.ts` at
// the same segment as a `page.tsx`, so `/student/buddy` CANNOT grow a POST
// handler. The callback has to be its own API route that verifies, activates
// and then redirects the browser to the page.
//
// WHAT THIS ROUTE IS NOT: a second activation path. It verifies the signature
// and then calls the SAME activatePaidOrder() the webhook calls, so the two
// legs race harmlessly — whichever arrives first activates, the second finds
// the row already 'paid' and does nothing. There is exactly one activator.
//
// SECURITY, unchanged or stronger:
//   · the signature is verified SERVER-SIDE against the API key secret before
//     anything is written. An unverified return activates NOTHING and says so.
//   · no entitlement is granted from a client-side claim of success — this is
//     a Razorpay-signed POST, not a fetch our own JavaScript made.
//   · the return destination is allow-listed (lib/payment-return.ts), because
//     it arrives in the query string and would otherwise be an open redirect
//     wearing the payment flow's credibility.

export const dynamic = 'force-dynamic';

/** 303 so the browser turns Razorpay's POST into a GET of the page. */
function land(request: NextRequest, key: unknown, outcome: 'paid' | 'failed' | 'unverified') {
  return NextResponse.redirect(new URL(paymentReturnPath(key, outcome), request.nextUrl.origin), 303);
}

export async function POST(request: NextRequest) {
  const dest = request.nextUrl.searchParams.get('dest');

  // Razorpay posts application/x-www-form-urlencoded. Reading it as form data
  // also tolerates multipart, which some proxies rewrite it to.
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    console.error('[pay-callback] unreadable body');
    return land(request, dest, 'unverified');
  }
  const str = (k: string) => {
    const v = form.get(k);
    return typeof v === 'string' && v.length > 0 && v.length < 200 ? v : null;
  };

  const orderId = str('razorpay_order_id');
  const paymentId = str('razorpay_payment_id');
  const signature = str('razorpay_signature');

  const admin = createAdminClient();

  // FAILURE LEG. With redirect:true Razorpay sends the student back here on a
  // failed or abandoned payment too, carrying error fields instead of a
  // signature. That is not an error of ours — it is the student's card being
  // declined — so it lands them somewhere honest rather than on a stack trace.
  if (!paymentId || !signature) {
    const failedOrder = str('error[metadata][order_id]') ?? orderId;
    const reason = str('error[code]') ?? 'no_signature';
    console.warn('[pay-callback] payment did not complete:', reason, failedOrder ?? '(no order)');
    // analytics_events.student_id is NOT NULL, so this event must be
    // ATTRIBUTED or not written. It is never attributed to a placeholder: a
    // funnel row pointing at the wrong student is worse than a missing one,
    // because it is indistinguishable from a real attempt by that person.
    if (failedOrder) {
      try {
        const row = await readWebhookPaymentRow(admin, failedOrder);
        if (row) {
          await emitPaymentFunnel(admin, row.student_id, 'payment_checkout_failed', {
            order_id: failedOrder, plan: row.plan, reason: reason.slice(0, 120),
          });
        }
      } catch (e) {
        console.error('[pay-callback] could not attribute the failure event:', e);
      }
    }
    return land(request, dest, 'failed');
  }

  const secret = process.env.RAZORPAY_KEY_SECRET ?? '';
  if (!verifyCheckoutSignature(orderId, paymentId, signature, secret)) {
    // Someone POSTed us a payment we cannot prove happened. Activate nothing.
    // The webhook remains the independent path that WILL activate a genuine
    // payment, so a student is never stranded by this refusal.
    console.error('[pay-callback] SIGNATURE MISMATCH for order', orderId);
    return land(request, dest, 'unverified');
  }

  try {
    const row = await readWebhookPaymentRow(admin, orderId!);
    if (!row) {
      // Verified by Razorpay but absent from our ledger. Do not invent a row;
      // reconciliation owns that case and runs on a schedule.
      console.error('[pay-callback] verified payment has no ledger row:', orderId);
      return land(request, dest, 'unverified');
    }
    await emitPaymentFunnel(admin, row.student_id, 'payment_checkout_returned', {
      order_id: orderId!, plan: row.plan,
    }).catch(() => {});

    if (mayActivatePayment(row.status)) {
      // 'webhook' is the honest source label: this is the same signed-by-
      // Razorpay activation the webhook performs, arriving by the return leg
      // instead. Inventing a third ActivationSource would fork a type that
      // two crons and the MIS already read.
      await activatePaidOrder(admin, row, orderId!, paymentId, 'webhook');
    }
    return land(request, dest, 'paid');
  } catch (e) {
    // The payment IS verified. An activation failure here must not tell the
    // student their payment failed — the webhook will still land it.
    console.error('[pay-callback] activation failed after a VERIFIED payment:', e);
    return land(request, dest, 'paid');
  }
}

// A GET here means someone opened the callback by hand, or Razorpay changed
// its method. Neither should render a 405 to a human mid-payment.
export async function GET(request: NextRequest) {
  return land(request, request.nextUrl.searchParams.get('dest'), 'unverified');
}
