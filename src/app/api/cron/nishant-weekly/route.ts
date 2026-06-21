import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushToUser } from '@/lib/push';
import { authorizedCron } from '@/lib/cron-auth';

// Founder weekly check-in — personal, from Nishant, not from "the system".
// Runs every Sunday at 08:00 UTC (1:30 PM IST).
// At 20 users, sends to all. Scale: move to random 10% once >50 students.
export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  const { data: students } = await admin
    .from('profiles')
    .select('id, full_name, notif_prefs')
    .eq('role', 'student');
  if (!students?.length) return NextResponse.json({ sent: 0 });

  // Dedup: don't send if already got one in the last 6 days
  const since6d = new Date(Date.now() - 6 * 86_400_000).toISOString();
  const studentIds = students.map((s) => s.id);
  const { data: recentPings } = await admin
    .from('notifications')
    .select('user_id')
    .in('user_id', studentIds)
    .eq('type', 'founder_ping')
    .gte('created_at', since6d);
  const alreadyPinged = new Set((recentPings ?? []).map((n) => n.user_id));

  const eligible = students.filter((s) => !alreadyPinged.has(s.id));

  const title = 'Hey, Nishant here.';
  const body = 'Just checking — how\'s CAT prep going? Reply anytime, I read everything.';

  let sent = 0;
  for (const s of eligible) {
    const prefs = (s.notif_prefs ?? {}) as Record<string, unknown>;

    await admin.from('notifications').insert({
      user_id: s.id, type: 'founder_ping',
      title, body,
      data: { url: '/student/buddy', from: 'nishant' }, read: false, channel: 'in_app',
    });

    if (prefs.push === true) {
      await sendPushToUser(s.id, { title, body, url: '/student/buddy' });
    }

    sent++;
  }

  return NextResponse.json({ sent, total: students.length });
}

export { POST as GET };
