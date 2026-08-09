import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { isValidPushEndpoint } from '@/lib/push-validate';

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

  // Context of the grant: 'standalone' = real installed-app push (deliverable),
  // 'browser'/'twa' = browser-tab push (often undeliverable, esp. iOS Safari).
  // This is the field that finally distinguishes the two — the root cause of
  // "permission on, notifications never arrive".
  const rawCtx = typeof body?.context === 'string' ? body.context : null;
  const pushContext = rawCtx && ['standalone', 'twa', 'ios_app', 'browser', 'unknown'].includes(rawCtx) ? rawCtx : null;

  const admin = createAdminClient();
  // Merge push:true into existing prefs — never clobber daily_reminder/email/time.
  const { data: profile } = await admin.from('profiles').select('notif_prefs, push_subscribed_at').eq('id', user.id).single();
  const notif_prefs = { ...(profile?.notif_prefs as Record<string, unknown> ?? {}), push: true };
  const now = new Date().toISOString();
  // A fresh subscription resurrects the channel — clear the death stamp.
  // push_subscribed_at is set ONCE (first-ever sub) so we can measure true
  // subscription lifetime; push_resubscribed_at moves on every (re)persist.
  await admin.from('profiles')
    .update({
      push_subscription: subscription,
      notif_prefs,
      push_died_at: null,
      push_subscribed_at: (profile?.push_subscribed_at as string | null) ?? now,
      push_resubscribed_at: now,
      ...(pushContext ? { push_context: pushContext } : {}),
    })
    .eq('id', user.id);

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
