import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { dispatch } from '@/lib/notification-os';
import { campaignState, CAMPAIGN, mayShowSeatsLeft } from '@/lib/campaign';
import { campaignSeatsSold } from '@/lib/pricing';
import { claimBuddyPitch, settleBuddyPitch } from '@/lib/promo-impression';

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

// EVERY wave in this table sells the Buddy — which makes this whole route a
// BUDDY PROMOTIONAL CAMPAIGN, and therefore an interruptive pitch under the
// one-per-study-day rule. The flag is explicit rather than inferred so that a
// future non-Buddy campaign added here does NOT silently inherit the gate:
// whoever adds one must decide, in this line, whether it pitches Buddy.
const IS_BUDDY_CAMPAIGN = true;

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
      // Already gated, and now gated by the SAME rule the two student-facing
      // surfaces use, so no channel can ever announce a full counter.
      seats > 0 && mayShowSeatsLeft(seats, CAMPAIGN.slots)
        ? `Only ${seats} spots left. Your buddy till CAT for ₹2,499.`
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
  let alreadyPitched = 0;
  let released = 0;
  for (const r of audience as { id: string; notif_prefs?: Record<string, unknown> | null }[]) {
    try {
      // ONE PITCH PER STUDY DAY, PER STUDENT — claimed individually, before
      // the send, inside the loop. Per-student on purpose: a student whose
      // day is already taken (the morning modal, the evening cron, an
      // approved Brain push) is skipped and COUNTED, and every other eligible
      // student in the wave is untouched by that refusal. A claim that fails
      // for any other reason also skips — fail closed, never fail loud into
      // a double pitch. The approval workflow above (dryRun default, live
      // window, seats) is unchanged; this is the last gate before the wire.
      let pitch: { show: true; shownAt: string } | null = null;
      if (IS_BUDDY_CAMPAIGN) {
        const claim = await claimBuddyPitch(admin, r.id, 'approved_push');
        if (!claim.show) { alreadyPitched++; continue; }
        pitch = claim;
      }
      const outcome = await dispatch({
        userId: r.id, type: 'broadcast',
        title: COPY[wave].title, body: COPY[wave].body(state.seatsLeft),
        url: '/offer', data: { campaign: CAMPAIGN.id, wave },
        reason: `Campaign broadcast — ${CAMPAIGN.id}, wave ${wave}`, expectedAction: 'acknowledge',
        prefs: r.notif_prefs ?? {},
      });
      if (outcome === 'sent') sent++;
      // The wave must not cost a student their day when the send never landed.
      else if (pitch && await settleBuddyPitch(admin, r.id, 'broadcast', pitch, outcome) === 'released') released++;
    } catch {
      // One student's dead subscription must never stop the wave.
    }
  }

  return NextResponse.json({ dryRun: false, wave, sent, alreadyPitched, released, audience: audience.length, seatsLeft: state.seatsLeft });
}
