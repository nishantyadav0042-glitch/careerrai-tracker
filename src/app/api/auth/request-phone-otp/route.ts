import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeIndianPhone } from '@/lib/phone';
import { isAdminPhoneE164 } from '@/lib/admin-config';
import { clientIp } from '@/lib/request-ip';

export async function POST(request: NextRequest) {
  try {
    const { phone: rawPhone } = (await request.json()) as { phone?: string };
    const e164 = normalizeIndianPhone(rawPhone ?? '');
    if (!e164) {
      return NextResponse.json({ sent: false, message: 'Enter a valid 10-digit Indian mobile number.' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Freemium self-signup: ANY valid Indian mobile may request an OTP and get a
    // free student account — we no longer reject numbers that aren't allowlisted.
    // The allowlist now only *assigns* a non-student role (buddy/admin) or a
    // pre-paid student at verify time; it is no longer an access gate here.

    // Abuse / cost guard. Self-signup makes /request-phone-otp an open tap on a
    // paid SMS vendor (indiahost, ~1000-OTP plan, single vendor). Two ceilings:
    //   1. per-phone: 3 sends / 30 min + 30s cooldown (below).
    //   2. global daily: stop before the vendor quota is exhausted by abuse.
    // The admin phone is exempt — the founder must always be able to log in.
    // Robust parse: a blank env var (Number('')===0) must NOT disable all logins.
    const ip = clientIp(request);
    const isAdmin = await isAdminPhoneE164(e164);
    const parsedCeiling = Number(process.env.DAILY_OTP_CEILING);
    const DAILY_OTP_CEILING = Number.isFinite(parsedCeiling) && parsedCeiling > 0 ? parsedCeiling : 800;
    if (!isAdmin) {
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count: globalToday } = await admin
        .from('otp_send_events')
        .select('*', { count: 'exact', head: true })
        .gte('sent_at', dayAgo);
      if ((globalToday ?? 0) >= DAILY_OTP_CEILING) {
        console.error(`[request-phone-otp] daily OTP ceiling hit (${globalToday}/${DAILY_OTP_CEILING})`);
        return NextResponse.json(
          { sent: false, message: "We're experiencing very high signups right now. Please try again in a little while." },
          { status: 429 }
        );
      }

      // Per-IP burst cap. The per-phone limit below is trivially bypassed by
      // rotating numbers, which lets ONE source drain the global daily ceiling
      // and 429 every legitimate signup. Capping sends per IP per hour makes a
      // single-source flood far more expensive. Fail OPEN when the IP is unknown
      // so we never block a real user we simply can't identify. Tunable via env.
      if (ip) {
        const parsedIpCap = Number(process.env.OTP_IP_HOURLY_CAP);
        const OTP_IP_HOURLY_CAP = Number.isFinite(parsedIpCap) && parsedIpCap > 0 ? parsedIpCap : 30;
        const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { count: ipSends } = await admin
          .from('otp_send_events')
          .select('*', { count: 'exact', head: true })
          .eq('ip', ip)
          .gte('sent_at', hourAgo);
        if ((ipSends ?? 0) >= OTP_IP_HOURLY_CAP) {
          console.error(`[request-phone-otp] per-IP hourly cap hit (${ipSends}/${OTP_IP_HOURLY_CAP})`);
          return NextResponse.json(
            { sent: false, message: "We're experiencing very high signups right now. Please try again in a little while." },
            { status: 429 }
          );
        }
      }
    }

    // Per-phone rate check + reservation, atomic (security audit, 14 July):
    // claim_otp_send_slot does the count-check AND the otp_send_events insert
    // inside one advisory-locked transaction, closing the race where
    // concurrent requests for the same phone could all pass a separate
    // count-then-insert check and burst past the 3-per-30-min cap.
    const { data: slot, error: slotError } = await admin
      .rpc('claim_otp_send_slot', { p_phone: e164, p_ip: ip })
      .single<{ allowed: boolean; reason: string | null; wait_secs: number | null }>();
    if (slotError) {
      console.error('[request-phone-otp] claim_otp_send_slot error:', slotError.message);
    } else if (slot && !slot.allowed) {
      const message = slot.reason === 'cooldown'
        ? `Please wait ${slot.wait_secs}s before requesting another code.`
        : slot.reason;
      return NextResponse.json({ sent: false, message }, { status: 429 });
    }

    // Trigger Supabase phone OTP — Supabase generates the code and calls our SMS hook
    const pending: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (cookiesToSet) =>
            cookiesToSet.forEach(({ name, value, options }) =>
              pending.push({ name, value, options: options as Record<string, unknown> })
            ),
        },
      }
    );

    const { error } = await supabase.auth.signInWithOtp({ phone: e164 });
    if (error) {
      console.error('[request-phone-otp] signInWithOtp error:', error.message);
      const isRateLimited = error.status === 429 || /rate.limit/i.test(error.message);
      if (isRateLimited) {
        return NextResponse.json(
          { sent: false, message: 'Too many OTP requests. Wait a few minutes and try again.' },
          { status: 429 }
        );
      }
      return NextResponse.json({ sent: false, message: "Couldn't send the OTP. Try again." }, { status: 502 });
    }
    // (send event already recorded atomically by claim_otp_send_slot above)

    const res = NextResponse.json({ sent: true });
    pending.forEach(({ name, value, options }) =>
      res.cookies.set(name, value, options as Parameters<typeof res.cookies.set>[2])
    );
    return res;
  } catch (e) {
    console.error('[request-phone-otp] error', e);
    return NextResponse.json({ sent: false, message: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
