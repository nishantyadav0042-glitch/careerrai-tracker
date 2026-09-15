import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAdminAction } from '@/lib/audit';
import { alertKind, isDismissReason } from '@/lib/os/alert-dismissal';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Close a sacred alert the founder has already dealt with.
//
// Founder, 6 Sep 2026: "add a close button also here... so that I can tap
// already assigned or completed."
//
// THE INVARIANT THAT MAKES THIS SAFE: this route writes ONE row to
// founder_alert_dismissals and touches nothing else. It does not activate a
// payment, grant premium, assign a mentor, or edit any profile. Closing an
// alert is the founder saying "I have handled this", not the system claiming
// the underlying problem is gone — so /admin/payment/<id> and every other
// surface keep reporting the real state, and a dismissal can be undone by
// deleting a row with no repair work.
//
// That separation is deliberate and worth keeping: the tempting version of
// this button would "resolve" the alert by fixing the data, and a
// mis-tap would then silently mark an unpaid student premium.
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: { alertId?: unknown; reason?: unknown; studentId?: unknown; note?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const alertId = typeof body.alertId === 'string' ? body.alertId.trim() : '';
  if (!alertId) return NextResponse.json({ error: 'Missing alertId' }, { status: 400 });
  if (!isDismissReason(body.reason)) {
    return NextResponse.json({ error: 'Invalid reason' }, { status: 400 });
  }

  // A burst alert is about many students and carries no single id, so the
  // column is nullable and an empty string must become NULL rather than fail
  // the uuid cast.
  const rawStudent = typeof body.studentId === 'string' ? body.studentId.trim() : '';
  const studentId = rawStudent === '' ? null : rawStudent;

  const { error } = await admin.from('founder_alert_dismissals').upsert({
    alert_id: alertId,
    alert_kind: alertKind(alertId),
    student_id: studentId,
    reason: body.reason,
    note: typeof body.note === 'string' && body.note.trim() !== '' ? body.note.trim() : null,
    dismissed_by: user.id,
    dismissed_at: new Date().toISOString(),
  }, { onConflict: 'alert_id' });

  if (error) {
    console.error('[dismiss-alert] write failed:', error.message);
    // The founder must never be told an alert is closed when the row did not
    // land — it would reappear on the next load and read as the button being
    // broken, which is worse than an honest failure now.
    return NextResponse.json({ error: 'Could not close this alert. Try again.' }, { status: 500 });
  }

  await logAdminAction(user.id, 'alert.dismissed', 'founder_alert', alertId, {
    reason: body.reason, student_id: studentId,
  });

  return NextResponse.json({ ok: true, alertId });
}
