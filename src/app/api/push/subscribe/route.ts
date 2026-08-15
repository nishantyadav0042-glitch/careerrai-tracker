import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { isValidPushEndpoint } from '@/lib/push-validate';
import { registerSubscription } from '@/lib/push-subscription-registry';

export async function POST(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
  );

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
  // lib/push-subscribe.ts. Also used by the pre-auth signup path, so
  // push_subscribed_at can never again be skipped by one of the two callers.
  const update = registerSubscription(
    { notifPrefs: profile?.notif_prefs as Record<string, unknown> | null, pushSubscribedAt: profile?.push_subscribed_at as string | null },
    subscription,
    new Date().toISOString(),
    body?.context
  );

  await admin.from('profiles').update(update).eq('id', user.id);

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  await admin.from('profiles').update({ push_subscription: null }).eq('id', user.id);
  return NextResponse.json({ ok: true });
}
