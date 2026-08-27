import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { isValidPushEndpoint } from '@/lib/push-validate';
import { registerSubscription } from '@/lib/push-subscription-registry';
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
  return NextResponse.json({ ok: true });
}
