import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { createDailyRoom } from '@/lib/daily';

export const dynamic = 'force-dynamic';

// One-tap video-system health check (admin only) — born from the 21 July
// incident where Daily rooms created fine but JOINING was blocked by a
// missing payment method. This creates a real short-lived test room from
// production (where the API key lives) and returns its URL, so the admin can
// verify end-to-end from a phone: green + a joinable link = the whole video
// path works.
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = await createDailyRoom({ expiresAt: new Date(Date.now() + 30 * 60_000) });
  if (!url) {
    return NextResponse.json({
      ok: false,
      message: 'Daily room creation FAILED — check the API key in server_config and the payment method on dashboard.daily.co.',
    }, { status: 503 });
  }
  return NextResponse.json({
    ok: true,
    testRoom: url,
    message: 'Room created. Open testRoom on your phone — if it joins with just a name (no payment/moderator wall), the video system is fully healthy. Room self-expires in 30 minutes.',
  });
}
