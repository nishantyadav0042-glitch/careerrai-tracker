import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { settleCreditForSession } from '@/lib/session-credit';
import { createAdminClient } from '@/lib/supabase/admin';
import { dispatch } from '@/lib/notification-os';
import { canTransition, transitionRefusal, type SessionStatus } from '@/lib/session-lifecycle';

/**
 * POST /api/calendar/complete-orientation { sessionId }
 * Buddy calls this when the orientation session is done.
 * Marks the session completed and sets free_onboarding_used = true on the student.
 * Fires an analytics event for orientation→loop conversion tracking.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let sessionId: string | undefined;
    try {
      ({ sessionId } = await request.json());
    } catch {
      // validated below
    }
    if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 });

    const admin = createAdminClient();

    // Verify caller is the buddy for this session and it's an onboarding type
    const { data: session } = await admin
      .from('video_sessions')
      .select('id, buddy_id, student_id, session_type, session_status')
      .eq('id', sessionId)
      .single();

    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    if (session.buddy_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (session.session_type !== 'onboarding') {
      return NextResponse.json({ error: 'Not an orientation session' }, { status: 400 });
    }
    if (session.session_status === 'completed') {
      return NextResponse.json({ ok: true, alreadyCompleted: true });
    }
    // A cancelled or expired orientation cannot be completed. The DB trigger
    // (20260824e) refuses it; this returns the reason instead of letting the
    // write fail inside a Promise.all whose errors nobody reads.
    if (!canTransition(session.session_status as SessionStatus, 'completed')) {
      return NextResponse.json(
        { error: transitionRefusal(session.session_status as SessionStatus, 'completed') },
        { status: 409 },
      );
    }

    // Mark session complete and student orientation used — both atomic
    await Promise.all([
      admin
        .from('video_sessions')
        // ended_at is stamped by the DB trigger in the same statement that
        // changes the state (20260824e), so the two can never disagree.
        .update({ session_status: 'completed' })
        .eq('id', sessionId)
        .in('session_status', ['scheduled', 'active']),
      admin
        .from('profiles')
        .update({ free_onboarding_used: true })
        .eq('id', session.student_id),
      // Analytics: orientation completed — used for conversion funnel tracking
      admin.from('analytics_events').insert({
        student_id: session.student_id,
        event_type: 'orientation_completed',
        metadata: { session_id: sessionId, buddy_id: user.id },
      }),
    ]);

    // ORIENTATION CARRIES NO CREDIT — and this call is here precisely because
    // that is an assumption rather than a constraint. settleCreditForSession
    // looks the credit up BY SESSION, so for a genuine orientation it finds
    // nothing and returns { settled: 'none', reason: 'no_credit' }: a no-op.
    // If a paid credit is ever linked to a session that completes down this
    // path, it now reaches its terminal state instead of staying 'scheduled'
    // forever. Every OTHER completion/cancel/expiry route already settles;
    // this was the one exception, and an exception is where the next stranded
    // ₹299 would have come from.
    await settleCreditForSession(admin, sessionId as string, 'completed');

    // Through dispatch() — the retention bridge should reach the student's
    // phone at the exact moment motivation peaks, not wait in the bell.
    const { data: orientStudent } = await admin
      .from('profiles').select('notif_prefs').eq('id', session.student_id).single();
    await dispatch({
      userId: session.student_id,
      type: 'orientation_complete',
      title: '🎯 Orientation done — start your first week',
      body: "You've seen how it works. Log today and your first guidance session is when the real work begins.",
      url: '/student/tracker',
      data: { sessionId },
      reason: 'Orientation just completed — the first-log window is open right now',
      expectedAction: 'log_today',
      prefs: (orientStudent?.notif_prefs as Record<string, unknown>) ?? {},
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('complete-orientation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
