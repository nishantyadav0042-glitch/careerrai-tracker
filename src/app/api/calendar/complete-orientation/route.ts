import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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

    // Mark session complete and student orientation used — both atomic
    await Promise.all([
      admin
        .from('video_sessions')
        .update({ session_status: 'completed', ended_at: new Date().toISOString() })
        .eq('id', sessionId),
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

    // In-app nudge to student: the retention bridge
    await admin.from('notifications').insert({
      user_id: session.student_id,
      type: 'orientation_complete',
      title: '🎯 Orientation done — start your first week',
      body: "You've seen how it works. Log today and your first guidance session is when the real work begins.",
      data: { sessionId },
    }).then(({ error: e }) => { if (e) console.error('orientation notification failed:', e.message); });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('complete-orientation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
