import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushToUser } from '@/lib/push';
import { authorizedCron } from '@/lib/cron-auth';

// Minimal 1-level escalation: student message OR mock debrief unanswered by buddy for 48h
// → notify admin. Makes the "buddy responds within 24h" promise real.
// Runs at 15:30 UTC (9 PM IST) daily.
export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const since48h = new Date(Date.now() - 48 * 3_600_000).toISOString();
  const dedup24h = new Date(Date.now() - 24 * 3_600_000).toISOString();

  // Find admin users
  const { data: admins } = await admin.from('profiles').select('id, notif_prefs').eq('role', 'admin');
  if (!admins?.length) return NextResponse.json({ escalated: 0 });

  let escalated = 0;
  const issues: string[] = [];

  // 1. Chat messages from students unanswered >48h
  const { data: unansweredChats } = await admin
    .from('chat_messages')
    .select('id, student_id, buddy_id, created_at, body')
    .is('read_at', null)
    .lte('created_at', since48h)
    .not('sender_id', 'eq', 'buddy_id'); // sent by student, not read by buddy

  for (const msg of unansweredChats ?? []) {
    const { data: student } = await admin.from('profiles').select('full_name, buddy_id').eq('id', msg.student_id).single();
    const { data: buddy } = await admin.from('profiles').select('full_name').eq('id', msg.buddy_id).single();
    if (!student || !buddy) continue;

    const key = `chat_${msg.student_id}_${msg.buddy_id}`;
    const { data: recent } = await admin.from('notifications').select('id').eq('type', 'escalation')
      .contains('data', { key }).gte('created_at', dedup24h).limit(1);
    if (recent?.length) continue;

    const title = `${student.full_name} has waited 48h+ for ${buddy.full_name} — may need you to step in.`;
    const body = 'Student message unanswered for 48+ hours.';

    for (const a of admins) {
      await admin.from('notifications').insert({
        user_id: a.id, type: 'escalation', title, body,
        data: { key, url: '/admin', student_id: msg.student_id, buddy_id: msg.buddy_id }, read: false, channel: 'in_app',
      });
      if ((a.notif_prefs as Record<string, unknown>)?.push === true) {
        await sendPushToUser(a.id, { title, body, url: '/admin' });
      }
    }
    issues.push(key);
    escalated++;
  }

  // 2. Mock debriefs with no buddy feedback >48h
  const { data: unansweredMocks } = await admin
    .from('mock_debriefs')
    .select('id, student_id, taken_on, created_at')
    .lte('created_at', since48h);

  for (const mock of unansweredMocks ?? []) {
    const { data: student } = await admin.from('profiles').select('full_name, buddy_id').eq('id', mock.student_id).single();
    if (!student?.buddy_id) continue;

    // Check if buddy gave feedback after this mock
    const { data: feedback } = await admin.from('buddy_feedback')
      .select('id').eq('student_id', mock.student_id).gte('created_at', mock.created_at).limit(1);
    if (feedback?.length) continue;

    const { data: buddy } = await admin.from('profiles').select('full_name').eq('id', student.buddy_id).single();
    const key = `mock_${mock.id}`;
    const { data: recent } = await admin.from('notifications').select('id').eq('type', 'escalation')
      .contains('data', { key }).gte('created_at', dedup24h).limit(1);
    if (recent?.length) continue;

    const title = `${student.full_name}'s mock debrief has no feedback for 48h+ from ${buddy?.full_name ?? 'buddy'} — step in?`;
    const body = 'Mock submitted 48+ hours ago with no buddy feedback.';

    for (const a of admins) {
      await admin.from('notifications').insert({
        user_id: a.id, type: 'escalation', title, body,
        data: { key, url: '/admin', student_id: mock.student_id, buddy_id: student.buddy_id }, read: false, channel: 'in_app',
      });
      if ((a.notif_prefs as Record<string, unknown>)?.push === true) {
        await sendPushToUser(a.id, { title, body, url: '/admin' });
      }
    }
    issues.push(key);
    escalated++;
  }

  return NextResponse.json({ escalated, issues });
}

export { POST as GET };
