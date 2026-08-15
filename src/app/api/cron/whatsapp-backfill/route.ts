import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { dispatch } from '@/lib/notification-os';
import { authorizedCron } from '@/lib/cron-auth';
import { WHATSAPP_GROUP_URL } from '@/components/onboarding/whatsapp-optin';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// ── One-time backfill: the WhatsApp ask for students who signed up before ───
// it existed.
//
// Founder, 15 Aug: "those all the old students which are there on our app
// before this WhatsApp integration, we also need to get them in our WhatsApp
// group... this should be first thing for the older students tomorrow."
//
// The WhatsApp opt-in screen (post-signup-sequence.tsx) shipped 14 Aug
// 16:15 UTC. Everyone who signed up before that moment finished onboarding
// without ever being asked — 363 real students at the time this was written,
// every one of them reachable only by whatever channel they already have,
// which for many is neither the app nor push (see notification-health.ts's
// forensic split of "disconnected"/"not_asked"). WhatsApp is the one channel
// every one of them definitely has: a phone number.
//
// IDEMPOTENT BY DESIGN, so this is safe to leave cron-scheduled indefinitely
// rather than fired once by hand and forgotten: every send is deduped by a
// `whatsapp_backfill` notification row already existing for that student, the
// same pattern kohli-push and nishant-weekly already use. The first real run
// sends to everyone eligible; every run after that finds zero, because
// everyone eligible already has a row. Deleting the cron entry later is safe
// too — nothing else depends on it recurring.
//
// The push deep-links STRAIGHT to the WhatsApp group, not to the app. The
// service worker's click handler does `new URL(data.url, origin)` — an
// ABSOLUTE url (this one) is used as-is, so tapping opens WhatsApp directly,
// the one channel this backfill exists to grow.
//
// The cutoff is the exact deploy instant, not a rounded date — a student who
// signed up an hour before ship and one who signed up an hour after are a
// meaningfully different question ("never asked" vs "asked and skipped"),
// and rounding to a calendar day would misclassify whoever signed up in
// between.
const WHATSAPP_SCREEN_SHIPPED_AT = '2026-08-14T16:15:19+00:00';

const TITLE = 'Join the CareerRai WhatsApp group';
const BODY = "We strongly recommend it — 2 messages a day, to keep your prep consistent. Tap to join.";

export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  const { data: students } = await admin
    .from('profiles')
    .select('id, notif_prefs')
    .eq('role', 'student')
    .not('is_test_account', 'is', true)
    .not('is_demo', 'is', true)
    .lt('created_at', WHATSAPP_SCREEN_SHIPPED_AT);

  if (!students?.length) return NextResponse.json({ ok: true, eligible: 0, sent: 0 });

  const { data: already } = await admin
    .from('notifications')
    .select('user_id')
    .eq('type', 'whatsapp_backfill')
    .in('user_id', students.map((s) => s.id));
  const done = new Set((already ?? []).map((n) => n.user_id as string));

  let sent = 0;
  const outcomes: Record<string, number> = {};
  for (const s of students) {
    if (done.has(s.id)) continue;
    const outcome = await dispatch({
      userId: s.id,
      type: 'whatsapp_backfill',
      title: TITLE,
      body: BODY,
      url: WHATSAPP_GROUP_URL,
      reason: 'Signed up before the WhatsApp opt-in screen existed — one-time backfill ask',
      expectedAction: 'acknowledge',
      prefs: (s.notif_prefs as Record<string, unknown>) ?? {},
    });
    if (outcome === 'sent') sent++;
    outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
  }

  return NextResponse.json({ ok: true, eligible: students.length, alreadyDone: done.size, sent, outcomes });
}

export { POST as GET };
