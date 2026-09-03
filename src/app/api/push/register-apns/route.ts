import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { registerApnsEndpoint } from '@/lib/notification-endpoints';
import { isValidApnsToken } from '@/lib/apns';
import { logConsentEvent } from '@/lib/consent-history';

// ── THE TOKEN BRIDGE, WEB SIDE (task #78) ───────────────────────────────────
//
// The App Store app is a WKWebView wrapper around the already-authenticated
// web session. That makes identity binding trivial and safe: the NATIVE side
// obtains the APNs device token and hands it to the page it hosts (a
// WKScriptMessageHandler/evaluateJavaScript bridge); the PAGE — logged in as
// the student, carrying the student's own session cookie — POSTs it here.
// The token therefore binds to whoever is actually signed in on that phone,
// with zero native auth code and no second identity system.
//
// AUTHENTICATED, unlike the delivery beacons — and that is the security
// boundary, not a convenience. An unauthenticated registration endpoint would
// let any caller attach any token to any student and receive their
// notifications. Session required; the student in the session is the ONLY
// student the token can bind to.
//
// Account switching on a shared phone is handled one layer down:
// registerApnsEndpoint revokes any other student's live row for this same
// token before writing ours, so a phone notifies at most the person who last
// signed in on it.
//
// Deliberately does NOT touch profiles.push_subscription/push_subscribed_at —
// those columns are Web-Push-shaped, and an APNs token stuffed into them
// would be a lie every legacy reader believes. The registry is the home of
// mixed-provider truth; Step 3 migrates the readers to it.
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let token: unknown;
  try {
    ({ token } = await request.json());
  } catch {
    // fall through to validation
  }
  if (!isValidApnsToken(token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }

  const admin = createAdminClient();

  // First APNs device vs. a refresh/re-open — the same two consent facts the
  // web subscribe route tells apart, on the same ledger.
  const { data: existing } = await admin
    .from('notification_endpoints')
    .select('id')
    .eq('student_id', user.id)
    .eq('provider', 'apns')
    .is('revoked_at', null)
    .limit(1)
    .maybeSingle();

  await registerApnsEndpoint(admin, user.id, token.toLowerCase());

  await logConsentEvent(admin, user.id, existing ? 'subscription_refreshed' : 'subscription_created', 'ios_app');

  return NextResponse.json({ ok: true });
}
