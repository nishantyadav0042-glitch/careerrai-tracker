import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { sendNotification } from '@/lib/notifications';
import { campaignState, CAMPAIGN } from '@/lib/campaign';
import { campaignSeatsSold } from '@/lib/pricing';

// ── Campaign push waves — the REACTIVATION layer, not the sales engine ──────
//
// Founder's 360° brief (12 Aug): in-app carries the sales load; push exists to
// bring students back to the app. So this route is deliberately small and
// deliberately gated:
//
//  · It sends through sendNotification → sendPushToUser, which means the
//    Notification-OS rules still apply: the 10-per-day hard cap, delivery
//    beacons, click tracking. We are not building a second notification path.
//  · It NEVER sends to a premium student. Nobody who paid gets sold to.
//  · It refuses to send when the campaign is not live (window closed or the
//    50th seat gone), so a mistimed click cannot advertise a dead offer.
//  · `dryRun` (the default) returns the audience WITHOUT sending, so the
//    founder always sees who a wave would hit before it hits them.
//
// Waves: 'soft' (13 Aug, warmest), 'wide' (14 Aug), 'peak' / 'closing' (15 Aug).

export const maxDuration = 300;

type Wave = 'soft' | 'wide' | 'peak' | 'closing';

const COPY: Record<Wave, { title: string; body: (seats: number) => string }> = {
  soft: {
    title: 'Your buddy offer is open 🇮🇳',
    body: () => 'An IIM mentor who reads your mocks — ₹2,499 till CAT, instead of ₹2,999.',
  },
  wide: {
    title: 'Don\'t prepare alone till November',
    body: () => 'Independence Day offer: your own IIM buddy till exam day, ₹2,499. Save ₹500.',
  },
  peak: {
    title: '🇮🇳 Independence Day offer is live',
    body: () => 'IIM buddy till CAT — ₹2,499 instead of ₹2,999. Today only.',
  },
  closing: {
    title: 'Offer closes tonight',
    body: (seats) =>
      seats > 0 && seats <= 20
        ? `${seats} of ${CAMPAIGN.slots} spots left. Your buddy till CAT for ₹2,499.`
        : 'Your buddy till CAT for ₹2,499 — the offer ends at midnight.',
  },
};

export async function POST(request: NextRequest) {
  const { admin } = await requireAdmin();

  const { wave, dryRun = true } = (await request.json()) as { wave?: Wave; dryRun?: boolean };
  if (!wave || !(wave in COPY)) {
    return NextResponse.json({ error: 'wave must be one of: soft, wide, peak, closing' }, { status: 400 });
  }

  const sold = await campaignSeatsSold();
  const state = campaignState(new Date(), sold);
  if (!state.live) {
    // Refusing loudly beats advertising an offer that checkout will not honour.
    return NextResponse.json(
      { error: `Campaign is not live (phase: ${state.phase}, seats left: ${state.seatsLeft}). Nothing sent.` },
      { status: 409 },
    );
  }

  // The audience: real free students who can receive a push. Premium students
  // are excluded by construction — never sell to someone who already bought.
  const { data: rows } = await admin
    .from('profiles')
    .select('id, full_name, notif_prefs, last_seen_at')
    .eq('role', 'student')
    .not('is_test_account', 'is', true)
    .not('is_demo', 'is', true)
    .not('is_premium', 'is', true);

  const pushable = (rows ?? []).filter(
    (r: { notif_prefs?: { push?: boolean } | null }) => r.notif_prefs?.push === true,
  );

  // The soft wave goes only to students active in the last 14 days — the
  // warmest audience, and small enough that a broken funnel is discovered on
  // a handful of students rather than the whole base.
  const cutoff = Date.now() - 14 * 86_400_000;
  const audience = wave === 'soft'
    ? pushable.filter((r: { last_seen_at?: string | null }) =>
        r.last_seen_at ? Date.parse(r.last_seen_at) >= cutoff : false)
    : pushable;

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      wave,
      wouldSend: audience.length,
      seatsLeft: state.seatsLeft,
      title: COPY[wave].title,
      body: COPY[wave].body(state.seatsLeft),
      sample: audience.slice(0, 5).map((r: { full_name?: string | null }) => r.full_name ?? '(no name)'),
    });
  }

  let sent = 0;
  for (const r of audience as { id: string }[]) {
    try {
      await sendNotification({
        userId: r.id,
        type: 'broadcast',
        title: COPY[wave].title,
        body: COPY[wave].body(state.seatsLeft),
        channels: ['in_app', 'push'],
        data: { url: '/offer', campaign: CAMPAIGN.id, wave },
      });
      sent++;
    } catch {
      // One student's dead subscription must never stop the wave.
    }
  }

  return NextResponse.json({ dryRun: false, wave, sent, audience: audience.length, seatsLeft: state.seatsLeft });
}
