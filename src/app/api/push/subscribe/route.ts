import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { isValidPushEndpoint } from '@/lib/push-validate';
import { registerSubscription } from '@/lib/push-subscription-registry';
import { registerWebPushEndpoint, revokeAllEndpoints } from '@/lib/notification-endpoints';
import { logConsentEvent } from '@/lib/consent-history';

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Accept both { subscription } and a bare subscription body for safety.
  const body = await request.json();
  const subscription = body?.subscription ?? body;
  if (!subscription?.endpoint || !isValidPushEndpoint(subscription.endpoint)) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('notif_prefs, push_subscribed_at').eq('id', user.id).single();

  // The one canonical definition of "a subscription was registered" — see
  // the client-side subscribe helpers. Also used by the pre-auth signup path, so
  // push_subscribed_at can never again be skipped by one of the two callers.
  const update = registerSubscription(
    { notifPrefs: profile?.notif_prefs as Record<string, unknown> | null, pushSubscribedAt: profile?.push_subscribed_at as string | null },
    subscription,
    new Date().toISOString(),
    body?.context
  );

  await admin.from('profiles').update(update).eq('id', user.id);

  // DUAL-WRITE (Step 2 of the endpoint-registry migration). The profile
  // column above stays the authority for the ~15 modules still reading it;
  // this adds the row that lets the SAME student hold a second device
  // instead of the newer subscribe evicting the older one. It never throws —
  // a registry write must not fail a subscribe that already succeeded.
  await registerWebPushEndpoint(admin, user.id, subscription, {
    context: body?.context,
    platform: body?.platform,
  });

  // First-ever subscription for this student vs. a resubscribe (refresh or
  // recovery) are two different facts worth telling apart in the history —
  // pushSubscribedAt being null means this is the first one.
  const isFirstEver = profile?.push_subscribed_at == null;
  await logConsentEvent(admin, user.id, isFirstEver ? 'subscription_created' : 'subscription_refreshed', body?.context ?? null);
  if (isFirstEver) await logConsentEvent(admin, user.id, 'permission_granted');

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  await admin.from('profiles').update({ push_subscription: null }).eq('id', user.id);
  // Turning push off is a decision about the STUDENT, not about one device,
  // so every endpoint goes — unlike a 410, which kills only the endpoint that
  // returned it. Without this, a student who switched reminders off would
  // keep receiving them on any other registered device.
  await revokeAllEndpoints(admin, user.id, 'student_disabled_push');
  return NextResponse.json({ ok: true });
}
