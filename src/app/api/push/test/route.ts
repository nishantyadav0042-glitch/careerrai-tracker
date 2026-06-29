import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { sendPushToUser } from '@/lib/push';
import { createAdminClient } from '@/lib/supabase/admin';

// Sends a test push to the signed-in user — lets a real device confirm the whole
// pipeline (subscription → server → FCM → service worker) in one tap. Returns a
// clear status so the UI can explain failures (no subscription, VAPID not set).
export async function POST(request: NextRequest) {
  void request;
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('push_subscription')
    .eq('id', user.id)
    .single();

  if (!profile?.push_subscription) {
    return NextResponse.json(
      { ok: false, reason: 'no_subscription', message: 'Turn on push alerts first, then try the test.' },
      { status: 409 }
    );
  }

  const result = await sendPushToUser(user.id, {
    title: '🔔 CareerRai notifications are on',
    body: "Nice — this is a test alert. You'll get daily nudges and buddy updates here.",
    url: '/student/tracker',
  });

  if (result && result.ok === false) {
    return NextResponse.json({ ok: false, reason: result.reason, message: 'Could not send — see reason.' }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
