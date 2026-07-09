import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

// A real Web Push endpoint is always an https URL on a public hostname (FCM,
// Mozilla autopush, Apple, WNS). Reject anything else so a stored subscription
// can't later point the server's push POST at an internal/loopback host.
// Legit push services never use IP literals or internal hostnames, so this
// never rejects a genuine subscription.
function isValidPushEndpoint(endpoint: unknown): boolean {
  if (typeof endpoint !== 'string') return false;
  let url: URL;
  try { url = new URL(endpoint); } catch { return false; }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
  if (host.includes(':')) return false;                         // IPv6 literal
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;       // IPv4 literal
  return true;
}

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
  // Merge push:true into existing prefs — never clobber daily_reminder/email/time.
  const { data: profile } = await admin.from('profiles').select('notif_prefs').eq('id', user.id).single();
  const notif_prefs = { ...(profile?.notif_prefs as Record<string, unknown> ?? {}), push: true };
  // A fresh subscription resurrects the channel — clear the death stamp.
  await admin.from('profiles')
    .update({ push_subscription: subscription, notif_prefs, push_died_at: null })
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
