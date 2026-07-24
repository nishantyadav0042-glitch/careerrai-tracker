import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isRequestAdmin } from '@/lib/require-admin';
import { sendPushToUser } from '@/lib/push';

// The one action that actually lets a Brain-queued message reach a student.
// Reject just closes it out; nothing is ever sent on rejection.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isRequestAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const { approve } = (await request.json().catch(() => ({}))) as { approve?: boolean };
  const admin = createAdminClient();

  const { data: decision } = await admin
    .from('decision_log').select('id, student_id, action_id, send_status, pending_notification')
    .eq('id', id).maybeSingle();
  if (!decision) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (decision.send_status !== 'pending_approval') return NextResponse.json({ error: `Already ${decision.send_status}` }, { status: 409 });

  if (!approve) {
    await admin.from('decision_log').update({ send_status: 'rejected' }).eq('id', id);
    return NextResponse.json({ ok: true, status: 'rejected' });
  }

  const copy = decision.pending_notification as { title: string; body: string; url: string } | null;
  if (!copy) {
    await admin.from('decision_log').update({ send_status: 'rejected' }).eq('id', id);
    return NextResponse.json({ error: 'No content to send' }, { status: 400 });
  }

  const { data: row } = await admin.from('notifications').insert({
    user_id: decision.student_id, type: `brain_${decision.action_id}`, title: copy.title, body: copy.body,
    data: { url: copy.url }, read: false, channel: 'in_app',
    reason: `Approved Brain recommendation: ${decision.action_id}`, expected_action: decision.action_id,
  }).select('id').single();
  const notificationId = (row?.id as string) ?? null;

  if (notificationId) {
    const res = await sendPushToUser(decision.student_id as string, { title: copy.title, body: copy.body, url: copy.url, notifId: notificationId });
    if (res.ok) await admin.from('notifications').update({ pushed_at: new Date().toISOString() }).eq('id', notificationId);
  }

  await admin.from('decision_log').update({ send_status: 'sent', notification_id: notificationId }).eq('id', id);
  return NextResponse.json({ ok: true, status: 'sent', notificationId });
}
