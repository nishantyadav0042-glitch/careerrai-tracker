import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isRequestAdmin } from '@/lib/require-admin';
import { dispatch, type ExpectedAction } from '@/lib/notification-os';

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

  const { data: studentProfile } = await admin.from('profiles').select('notif_prefs').eq('id', decision.student_id).single();
  // decision.action_id is a DecisionEventType, and decision-engine's own
  // EXPECTED map (api/cron/decision-engine/route.ts) already constrains every
  // DecisionEventType to a valid ExpectedAction — the cast is asserting a
  // relationship the pipeline already enforces upstream, not inventing one.
  await dispatch({
    userId: decision.student_id as string, type: `brain_${decision.action_id}`,
    title: copy.title, body: copy.body, url: copy.url,
    reason: `Approved Brain recommendation: ${decision.action_id}`,
    expectedAction: decision.action_id as unknown as ExpectedAction,
    prefs: (studentProfile?.notif_prefs as Record<string, unknown>) ?? {},
  });

  const { data: sentRow } = await admin
    .from('notifications').select('id')
    .eq('user_id', decision.student_id).eq('type', `brain_${decision.action_id}`)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  const notificationId = sentRow?.id ?? null;

  await admin.from('decision_log').update({ send_status: 'sent', notification_id: notificationId }).eq('id', id);
  return NextResponse.json({ ok: true, status: 'sent', notificationId });
}
