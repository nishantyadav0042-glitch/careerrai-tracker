import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createRazorpayOrder } from '@/lib/razorpay';
import { paymentsEnabled } from '@/lib/feature-flags';
import { taxForPlan } from '@/lib/gst';
import { normalizeIndianPhone } from '@/lib/phone';
import {
  SESSION_PLAN_ID, SESSION_PRICE_PAISE, SESSION_MINUTES,
  rosterCapacity, matchMentor, readMentorRoster, hasOpenSessionCredit,
} from '@/lib/session-credit';
import { validateIntent } from '@/lib/session-intent';

// POST /api/sessions/book — buy ONE 1:1 session.
//
// Deliberately NOT part of create-order. That route is built around
// subscriptions: months, renewal dates, premium grants. A session shares none
// of it, and threading a fifth "plan" through those branches is how the
// subscription path acquires a bug it did not need.
//
// The order of operations is the safety property:
//   capacity → match → charge.
// We refuse before taking money, never after. A student who pays for a
// session nobody can hold is the one failure this whole design exists to
// prevent — and at four mentors it is a live risk, not a hypothetical.

export const dynamic = 'force-dynamic';

// loadRoster moved into lib/session-credit as readMentorRoster (Boundary 2,
// change 3): its two reads ignored their errors and failed in OPPOSITE
// directions — a mentors-read failure looked like "sold out" while a
// load-read failure made every mentor look free. The primitive retries once
// and THROWS, so a roster built from a failed read can no longer exist.

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!paymentsEnabled()) return NextResponse.json({ error: 'Payments are temporarily off.' }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as {
    finding_kind?: string; finding_evidence?: string;
    session_intent?: string; session_intent_note?: string;
  };
  const admin = createAdminClient();

  // ── WHY, before the money ────────────────────────────────────────────────
  // Validated first so a student is never charged for a booking that the
  // database would then refuse, and so the mentor is never handed a session
  // with no stated problem. Until today the reason for purchase was never
  // recorded at all: this route accepted finding_kind and matched a mentor
  // with it, but student_payments had no such column, so every credit was
  // minted with finding_kind = null.
  const intent = validateIntent(body.session_intent, body.session_intent_note);
  if (!intent.ok) return NextResponse.json({ error: intent.error }, { status: 400 });

  // 1. CAPACITY, before anything else — through the throwing primitives.
  // UNKNOWN answers 503 and stops here: it must never become "sold out"
  // (false denial) and never become "everyone is free" (oversell), and it
  // must sit BEFORE any Razorpay order exists.
  let roster;
  let alreadyBooked;
  try {
    [roster, alreadyBooked] = await Promise.all([
      readMentorRoster(admin),
      hasOpenSessionCredit(admin, user.id),
    ]);
  } catch {
    return NextResponse.json(
      { error: 'Could not check availability — please try again in a moment.', code: 'AVAILABILITY_READ_FAILED' },
      { status: 503 },
    );
  }
  if (rosterCapacity(roster) <= 0) {
    return NextResponse.json({
      error: 'All our Buddies are fully booked this week. We will not take your money for a session we cannot hold — check back in a day or two.',
      soldOut: true,
    }, { status: 409 });
  }

  // 2. Don't sell a second session while one is still unfinished. The old
  // read used maybeSingle with its error ignored — a failed read (or a
  // student who already had TWO open credits, which errors maybeSingle)
  // waved the buyer straight through to a second charge.
  if (alreadyBooked) {
    return NextResponse.json({
      error: 'You already have a session booked — let’s finish that one first.',
      alreadyBooked: true,
    }, { status: 409 });
  }

  // 3. Who would take it, and why. Computed BEFORE payment so we never charge
  //    for a session we cannot staff, and so the reason is recorded verbatim.
  const { data: me } = await admin.from('profiles')
    .select('self_reported_weakest_section, is_repeater').eq('id', user.id).maybeSingle();
  const match = matchMentor(roster, {
    // The student's own words outrank the product's diagnosis for MATCHING —
    // they are the one who has to feel understood in the first two minutes.
    // Both are still recorded; only the match preference is opinionated.
    findingKind: intent.intent
      ?? (typeof body.finding_kind === 'string' ? body.finding_kind : 'unreviewed'),
    studentWeakSection: (me?.self_reported_weakest_section as string | null) ?? null,
    studentIsRepeater: !!me?.is_repeater,
  });
  if (!match) {
    return NextResponse.json({ error: 'No Buddy is free this week. Please check back shortly.', soldOut: true }, { status: 409 });
  }

  // Contact details for Razorpay's prefill — same source and shape as
  // create-order's. Without these, Razorpay's first screen asks a signed-in
  // student for their phone number and email again, on the one screen where
  // that friction costs the sale.
  const { data: payer } = await admin
    .from('profiles')
    .select('full_name, phone, email')
    .eq('id', user.id)
    .maybeSingle();
  const prefill = {
    name: payer?.full_name || undefined,
    contact: normalizeIndianPhone(payer?.phone) ?? undefined,
    email: payer?.email || undefined,
  };

  // 4. Only now, money. GST is currently off, so gross === ₹299.
  const tax = taxForPlan(SESSION_PLAN_ID, SESSION_PRICE_PAISE);
  const order = await createRazorpayOrder(
    tax.grossPaise,
    `crsess_${user.id.slice(0, 8)}_${Date.now()}`,
    {
      service: '1:1 CAT mentorship session',
      plan: 'Single session',
      description: `One ${SESSION_MINUTES}-minute 1:1 session with an IIM mentor`,
    },
  );

  const { error } = await admin.from('student_payments').insert({
    student_id: user.id,
    amount: tax.grossPaise,
    original_amount: SESSION_PRICE_PAISE,
    plan: SESSION_PLAN_ID,
    base_paise: tax.basePaise,
    gst_paise: tax.gstPaise,
    gst_rate: tax.rate,
    tax_mode: tax.mode,
    razorpay_order_id: order.id,
    status: 'created',
    // Carried on the payment because the credit is minted later by the
    // verified webhook — the payment row is the only thing that survives the
    // round trip through Razorpay.
    session_intent: intent.intent,
    session_intent_note: intent.note,
    finding_kind: typeof body.finding_kind === 'string' ? body.finding_kind : null,
    finding_evidence: typeof body.finding_evidence === 'string' ? body.finding_evidence : null,
  });
  if (error) {
    console.error('[sessions/book] payment row failed', error.message);
    return NextResponse.json({ error: 'Could not start checkout — try again.' }, { status: 500 });
  }

  // The match is carried on the order notes rather than written now: the
  // credit is only minted by the verified webhook, so nothing is reserved
  // until the money is real.
  return NextResponse.json({
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId: process.env.RAZORPAY_KEY_ID,
    matchReason: match.reason,
    minutes: SESSION_MINUTES,
    prefill,
  });
}

// GET — can a session be sold right now, and by whom? Drives the card's copy
// so a student never taps a button that is going to refuse them.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  // UNKNOWN is 503 here too — answering available:false on a failed read
  // would be the same ERROR→FALSE conversion in display clothing, and
  // alreadyBooked:false would invite a purchase the POST would then refuse.
  let roster;
  let alreadyBooked;
  try {
    [roster, alreadyBooked] = await Promise.all([
      readMentorRoster(admin),
      hasOpenSessionCredit(admin, user.id),
    ]);
  } catch {
    return NextResponse.json(
      { error: 'Could not check availability — please try again.', code: 'AVAILABILITY_READ_FAILED' },
      { status: 503 },
    );
  }

  return NextResponse.json({
    available: rosterCapacity(roster) > 0,
    // A number this small is not published — "2 spots left" over four mentors
    // reports how small we are (the no-small-numbers rule). It only ever
    // gates the button.
    alreadyBooked,
    priceLabel: '₹299',
    minutes: SESSION_MINUTES,
  });
}
