import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createRazorpayOrder } from '@/lib/razorpay';
import { paymentsEnabled } from '@/lib/feature-flags';
import { taxForPlan } from '@/lib/gst';
import { normalizeIndianPhone } from '@/lib/phone';
import {
  SESSION_PLAN_ID, SESSION_PRICE_PAISE, SESSION_MINUTES,
  rosterCapacity, matchMentor, type MentorProfile, type Speciality,
} from '@/lib/session-credit';

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

/** Sessions assigned but not yet completed still occupy a mentor's week. */
function weekStartIso(): string {
  const now = new Date();
  const d = new Date(now.getTime() - ((now.getUTCDay() + 6) % 7) * 86_400_000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

export async function loadRoster(admin: ReturnType<typeof createAdminClient>): Promise<MentorProfile[]> {
  const [{ data: mentors }, { data: open }] = await Promise.all([
    admin.from('profiles')
      .select('id, full_name, specialities, strongest_section, own_weakest_section, attempt_number, weekly_session_cap')
      .eq('role', 'buddy')
      .not('weekly_session_cap', 'is', null),
    admin.from('session_credits')
      .select('buddy_id')
      .in('status', ['assigned', 'scheduled'])
      .gte('assigned_at', weekStartIso()),
  ]);

  const load = new Map<string, number>();
  for (const c of open ?? []) {
    if (c.buddy_id) load.set(c.buddy_id as string, (load.get(c.buddy_id as string) ?? 0) + 1);
  }

  return (mentors ?? []).map((m) => ({
    buddyId: m.id as string,
    fullName: ((m.full_name as string | null) ?? 'Your Buddy').split(' ')[0],
    specialities: ((m.specialities as string[] | null) ?? []) as Speciality[],
    strongestSection: (m.strongest_section as string | null) ?? null,
    ownWeakestSection: (m.own_weakest_section as string | null) ?? null,
    attemptNumber: (m.attempt_number as number | null) ?? null,
    weeklyCap: (m.weekly_session_cap as number | null) ?? null,
    openThisWeek: load.get(m.id as string) ?? 0,
  }));
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!paymentsEnabled()) return NextResponse.json({ error: 'Payments are temporarily off.' }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as { finding_kind?: string; finding_evidence?: string };
  const admin = createAdminClient();

  // 1. CAPACITY, before anything else.
  const roster = await loadRoster(admin);
  if (rosterCapacity(roster) <= 0) {
    return NextResponse.json({
      error: 'All our Buddies are fully booked this week. We will not take your money for a session we cannot hold — check back in a day or two.',
      soldOut: true,
    }, { status: 409 });
  }

  // 2. Don't sell a second session while one is still unfinished.
  const { data: openCredit } = await admin
    .from('session_credits')
    .select('id, status')
    .eq('student_id', user.id)
    .in('status', ['paid', 'assigned', 'scheduled'])
    .maybeSingle();
  if (openCredit) {
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
    findingKind: typeof body.finding_kind === 'string' ? body.finding_kind : 'unreviewed',
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
  const roster = await loadRoster(admin);
  const remaining = rosterCapacity(roster);

  const { data: openCredit } = await admin
    .from('session_credits')
    .select('status')
    .eq('student_id', user.id)
    .in('status', ['paid', 'assigned', 'scheduled'])
    .maybeSingle();

  return NextResponse.json({
    available: remaining > 0,
    // A number this small is not published — "2 spots left" over four mentors
    // reports how small we are (the no-small-numbers rule). It only ever
    // gates the button.
    alreadyBooked: !!openCredit,
    priceLabel: '₹299',
    minutes: SESSION_MINUTES,
  });
}
