import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushToUser } from '@/lib/push';
import { getBuddyPingMessage } from '@/lib/notification-engine';

// Random buddy ping — fires every other day, sends to students who haven't had
// a buddy ping in 7–10 days. The untriggered "elder sibling" check-in.
// Vercel Cron: 30 11 * * * (5:00 PM IST, alternating with daily reminder)
export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const since7d = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const since24h = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const todayStart = new Date().toISOString().split('T')[0] + 'T00:00:00.000Z';

  // Get all active students
  const { data: students } = await admin
    .from('profiles')
    .select('id, full_name, notif_prefs')
    .eq('role', 'student')
    .not('subscription_status', 'eq', 'paused');
  if (!students?.length) return NextResponse.json({ pinged: 0 });

  const studentIds = students.map((s) => s.id);

  // Students who got a buddy ping in the last 7 days — skip them
  const { data: recentPings } = await admin
    .from('notifications')
    .select('user_id')
    .in('user_id', studentIds)
    .eq('type', 'buddy_ping')
    .gte('created_at', since7d);
  const recentlyPinged = new Set((recentPings ?? []).map((n) => n.user_id));

  // Students who already got any reminder today — respect the daily cap
  const { data: todayNotifs } = await admin
    .from('notifications')
    .select('user_id')
    .in('user_id', studentIds)
    .in('type', ['daily_reminder', 'buddy_ping'])
    .gte('created_at', todayStart);
  const todayCount = new Map<string, number>();
  for (const n of todayNotifs ?? []) {
    todayCount.set(n.user_id, (todayCount.get(n.user_id) ?? 0) + 1);
  }

  // Randomise order so the ping goes to different people each run
  const shuffled = [...students].sort(() => Math.random() - 0.5);

  // Send to max 30% of eligible students per run (keeps it unpredictable)
  const eligiblePool = shuffled.filter(
    (s) => !recentlyPinged.has(s.id) && (todayCount.get(s.id) ?? 0) < 2
  );
  const sendCount = Math.max(1, Math.ceil(eligiblePool.length * 0.3));
  const batch = eligiblePool.slice(0, sendCount);

  let pinged = 0;
  for (const s of batch) {
    const prefs = (s.notif_prefs ?? {}) as Record<string, unknown>;
    const { title, body } = getBuddyPingMessage();

    // In-app
    await admin.from('notifications').insert({
      user_id: s.id,
      type: 'buddy_ping',
      title,
      body,
      data: { url: '/student/tracker', bucket: 'buddy_ping' },
      read: false,
      channel: 'in_app',
    });

    // Push
    if (prefs.push === true) {
      await sendPushToUser(s.id, { title, body, url: '/student/tracker' });
    }

    pinged++;
  }

  return NextResponse.json({ pinged, eligible: eligiblePool.length, total: students.length });
}

export { POST as GET };
