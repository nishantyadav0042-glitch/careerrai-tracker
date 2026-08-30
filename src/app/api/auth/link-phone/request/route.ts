import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeIndianPhone } from '@/lib/phone';
import { clientIp } from '@/lib/request-ip';
import { supabaseUrl, supabaseAnonKey } from '@/lib/supabase/env';
import { planPhoneLink } from '@/lib/identity';

// ── ATTACH A PHONE TO THE ACCOUNT THAT IS ALREADY SIGNED IN (Incident #62) ──
//
// Not a login. The caller is already authenticated — by Google, by an emailed
// link, by whatever door let them in — and this endpoint gives that EXISTING
// account the anchor it lacks. That distinction is the whole design: nothing
// here may ever create a user, because creating one is how a student ends up
// with two.
//
// Deliberately reuses the machinery the OTP door already has rather than
// growing a second one:
//   · claim_otp_send_slot — the same atomic per-phone 3-per-30-min + 30s
//     cooldown reservation, so this route cannot be used to bypass the limit
//     that protects the SMS bill (Incident from the 14 July audit).
//   · supabase.auth.updateUser({ phone }) — Supabase generates and later
//     verifies the code, and delivery goes out through the same Send SMS hook
//     to the same vendor. No second OTP implementation, no second transport,
//     and WhatsApp-first delivery lands here for free when the hook learns it.

export async function POST(request: NextRequest) {
  try {
    const { phone: rawPhone } = (await request.json()) as { phone?: string };
    const e164 = normalizeIndianPhone(rawPhone ?? '');

    const pending: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
    const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) =>
          cookiesToSet.forEach(({ name, value, options }) =>
            pending.push({ name, value, options: options as Record<string, unknown> })
          ),
      },
    });

    // getUser(), not getClaims(): this route is about to mutate the identity of
    // whoever it thinks is calling, so the token is validated against Supabase
    // rather than merely decoded.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ sent: false, message: 'Please sign in again.' }, { status: 401 });

    const admin = createAdminClient();

    // Who holds this number TODAY. Asked before a code is sent, so a student
    // whose number belongs to another account is told plainly instead of
    // receiving an SMS that leads to a dead end.
    //
    // Reuses profile_id_for_verified_phone (migration 20260819f) rather than
    // adding a second "who owns this phone" function — the assignment matcher
    // already asks this exact question of auth.users, server-side only.
    const { data: ownerId } = await admin.rpc('profile_id_for_verified_phone', { p_phone: e164 ?? '' });
    const plan = planPhoneLink({
      e164,
      ownerAccountId: (ownerId as string | null) ?? null,
      thisAccountId: user.id,
    });

    if (plan.kind === 'refuse') {
      if (plan.reason === 'invalid_phone') {
        return NextResponse.json(
          { sent: false, message: 'Enter a valid 10-digit Indian mobile number.' },
          { status: 400 }
        );
      }
      // THE conflict. Never merged, never guessed — see identity.ts. The student
      // already has a CareerRai account on this number and must sign into it
      // through the door that owns it.
      return NextResponse.json(
        {
          sent: false,
          conflict: true,
          message: 'This number already has a CareerRai account. Sign in with OTP on that number instead.',
        },
        { status: 409 }
      );
    }

    if (plan.kind === 'already_anchored') {
      // Idempotent: nothing to do, and saying "done" is truthful. Sending
      // another code would spend an SMS to re-prove a fact already recorded.
      return NextResponse.json({ sent: false, alreadyLinked: true });
    }

    // Same reservation the signup door takes. If it refuses, we refuse — the
    // point of an atomic slot is that every caller goes through it.
    const { data: slot, error: slotError } = await admin
      .rpc('claim_otp_send_slot', { p_phone: plan.e164, p_ip: clientIp(request) })
      .single<{ allowed: boolean; reason: string | null; wait_secs: number | null }>();
    if (slotError) {
      console.error('[link-phone/request] claim_otp_send_slot error:', slotError.message);
    } else if (slot && !slot.allowed) {
      const message = slot.reason === 'cooldown'
        ? `Please wait ${slot.wait_secs}s before requesting another code.`
        : slot.reason;
      return NextResponse.json({ sent: false, message }, { status: 429 });
    }

    // Sends the OTP AND stages the change. GoTrue holds the new number in
    // phone_change until the code is verified, so a request that is never
    // completed leaves the account exactly as it was.
    const { error } = await supabase.auth.updateUser({ phone: plan.e164 });
    if (error) {
      console.error('[link-phone/request] updateUser error:', error.message);
      // GoTrue's own uniqueness check, reached when a number was claimed between
      // our lookup and this call, or when the owner never confirmed it so
      // profile_id_for_verified_phone could not see them.
      if (/already|exist|registered|duplicate/i.test(error.message)) {
        return NextResponse.json(
          {
            sent: false,
            conflict: true,
            message: 'This number already has a CareerRai account. Sign in with OTP on that number instead.',
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ sent: false, message: "Couldn't send the OTP. Try again." }, { status: 502 });
    }

    const res = NextResponse.json({ sent: true });
    pending.forEach(({ name, value, options }) =>
      res.cookies.set(name, value, options as Parameters<typeof res.cookies.set>[2])
    );
    return res;
  } catch (e) {
    console.error('[link-phone/request] error', e);
    return NextResponse.json({ sent: false, message: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
