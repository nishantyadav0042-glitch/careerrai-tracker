import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/calendar/cancel-meeting
 * Buddy cancels a scheduled session: marks the row cancelled and notifies the
 * student in-app. (Sessions use Daily/Jitsi links now — there is no calendar
 * event to delete; the DB confirmed zero legacy Google-event sessions.)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    }

    let meetingId: string | undefined;
    try {
      ({ meetingId } = await request.json());
    } catch {
      // fall through to validation
    }
    if (!meetingId) {
      return NextResponse.json({ error: 'meetingId is required.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: session } = await admin
      .from('video_sessions')
      .select('id, buddy_id, student_id, title, session_status')
      .eq('id', meetingId)
      .single();

    if (!session) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
    }
    if (session.buddy_id !== user.id) {
      return NextResponse.json(
        { error: 'Only the buddy who scheduled this session can cancel it.' },
        { status: 403 }
      );
    }
    if (session.session_status === 'cancelled') {
      return NextResponse.json({ success: true, alreadyCancelled: true });
    }

    const { error: updateError } = await admin
      .from('video_sessions')
      .update({ session_status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', meetingId);

    if (updateError) {
      console.error('Cancel update failed:', updateError);
      return NextResponse.json(
        { error: "Couldn't update the session — try again." },
        { status: 500 }
      );
    }

    await admin
      .from('notifications')
      .insert({
        user_id: session.student_id,
        type: 'session_cancelled',
        title: 'Session cancelled',
        body: `${session.title || 'Your upcoming session'} was cancelled by your buddy. They'll reschedule soon.`,
        data: { sessionId: session.id },
      })
      .then(({ error: e }) => {
        if (e) console.error('Notification insert failed:', e.message);
      });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('cancel-meeting error:', error);
    return NextResponse.json(
      { error: "Couldn't cancel the meeting — try again." },
      { status: 500 }
    );
  }
}
