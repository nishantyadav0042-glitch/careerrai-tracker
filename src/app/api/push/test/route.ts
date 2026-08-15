import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { dispatch } from '@/lib/notification-os';
import { createAdminClient } from '@/lib/supabase/admin';

// Sends a test push to the signed-in user — lets a real device confirm the whole
// pipeline (subscription → server → FCM → service worker) in one tap. Returns a
// clear status so the UI can explain failures (no subscription, VAPID not set).
//
// Fixed 15 Aug: this route used to call the transport directly with no
// notifId, so even the founder's own "test my notifications" button could
// never confirm a receipt — the exact defect found across thirteen other
// call sites, in the one place built specifically to prove the pipeline
// works. Routed through dispatch() now, so this test IS a real, attributable
// notification: its id is returned, and `notifications.received_at` /
// `clicked_at` for that id will fill in from the real device the moment the
// service worker's beacons fire, the same as any other push.
export async function POST(request: NextRequest) {
  void request;
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('push_subscription, notif_prefs')
    .eq('id', user.id)
    .single();

  if (!profile?.push_subscription) {
    return NextResponse.json(
      { ok: false, reason: 'no_subscription', message: 'Turn on push alerts first, then try the test.' },
      { status: 409 }
    );
  }

  // dispatch() only attempts a push when prefs.push === true. The subscription
  // check above is real, but a student could in principle hold a live
  // subscription with the preference off (e.g. mid-toggle) — force push:true
  // for this one attempt, since tapping "test" is itself explicit intent.
  const prefs = { ...(profile.notif_prefs as Record<string, unknown> ?? {}), push: true };

  const outcome = await dispatch({
    userId: user.id, type: 'push_self_test', prefs,
    title: '🔔 CareerRai notifications are on',
    body: "Nice — this is a test alert. You'll get daily nudges and buddy updates here.",
    url: '/student/tracker',
    reason: 'Student tapped "Send test notification" in Settings',
    expectedAction: 'acknowledge',
  });

  if (outcome !== 'sent') {
    return NextResponse.json(
      { ok: false, reason: outcome, message: outcome === 'daily_cap' ? "You've hit today's push limit — try again tomorrow." : 'Could not send.' },
      { status: 502 }
    );
  }

  // Read back the row dispatch() just created — the founder-facing "prove the
  // pipeline" requirement wants the id, not just a boolean.
  const { data: sent } = await admin
    .from('notifications')
    .select('id, pushed_at')
    .eq('user_id', user.id)
    .eq('type', 'push_self_test')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    notificationId: sent?.id ?? null,
    pushedAt: sent?.pushed_at ?? null,
  });
}
