import { createAdminClient } from '@/lib/supabase/admin';
import { generateGoogleMeetLink, daysSinceLastSession } from '@/lib/gmeet-utils';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/video-sessions
 * Get video sessions for student or buddy
 */
export async function GET(request: NextRequest) {
  try {
    const admin = createAdminClient();
    const url = new URL(request.url);
    const studentId = url.searchParams.get('student_id');
    const buddyId = url.searchParams.get('buddy_id');

    if (!studentId && !buddyId) {
      return NextResponse.json(
        { error: 'student_id or buddy_id required' },
        { status: 400 }
      );
    }

    let query = admin.from('video_sessions').select('*');

    if (studentId) {
      query = query.eq('student_id', studentId);
    }
    if (buddyId) {
      query = query.eq('buddy_id', buddyId);
    }

    const { data, error } = await query.order('scheduled_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ sessions: data });
  } catch (error) {
    console.error('Error fetching video sessions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sessions' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/video-sessions
 * Create a new video session
 */
export async function POST(request: NextRequest) {
  try {
    const admin = createAdminClient();
    const {
      student_id,
      buddy_id,
      scheduled_at,
      session_type = 'session',
      duration_minutes = 30,
      notes,
    } = await request.json();

    if (!student_id || !buddy_id) {
      return NextResponse.json(
        { error: 'student_id and buddy_id required' },
        { status: 400 }
      );
    }

    // Generate Google Meet link
    const gmeet_link = generateGoogleMeetLink();

    // Get last session date
    const { data: lastSession } = await admin
      .from('video_sessions')
      .select('ended_at')
      .eq('student_id', student_id)
      .eq('buddy_id', buddy_id)
      .eq('session_status', 'completed')
      .order('ended_at', { ascending: false })
      .limit(1)
      .single();

    const days_since_last = lastSession
      ? daysSinceLastSession(new Date(lastSession.ended_at))
      : 0;

    // Create session
    const { data, error } = await admin
      .from('video_sessions')
      .insert({
        student_id,
        buddy_id,
        gmeet_link,
        scheduled_at,
        session_type,
        duration_minutes,
        notes,
        session_status: 'scheduled',
        days_since_last_session: days_since_last,
      })
      .select()
      .single();

    if (error) throw error;

    // Log to history
    await admin.from('video_session_history').insert({
      session_id: data.id,
      event_type: 'created',
      event_data: { notes: 'Session created' },
    });

    return NextResponse.json({ session: data });
  } catch (error) {
    console.error('Error creating video session:', error);
    return NextResponse.json(
      { error: 'Failed to create session' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/video-sessions
 * Update video session status
 */
export async function PATCH(request: NextRequest) {
  try {
    const admin = createAdminClient();
    const {
      session_id,
      session_status,
      started_at,
      ended_at,
    } = await request.json();

    if (!session_id) {
      return NextResponse.json(
        { error: 'session_id required' },
        { status: 400 }
      );
    }

    const updateData: Record<string, any> = {
      session_status,
      updated_at: new Date().toISOString(),
    };

    if (started_at) updateData.started_at = started_at;
    if (ended_at) {
      updateData.ended_at = ended_at;
      updateData.last_session_date = ended_at;
    }

    const { data, error } = await admin
      .from('video_sessions')
      .update(updateData)
      .eq('id', session_id)
      .select()
      .single();

    if (error) throw error;

    // Log to history
    await admin.from('video_session_history').insert({
      session_id,
      event_type: session_status,
      event_data: { updated_fields: updateData },
    });

    return NextResponse.json({ session: data });
  } catch (error) {
    console.error('Error updating video session:', error);
    return NextResponse.json(
      { error: 'Failed to update session' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/video-sessions
 * Cancel a video session
 */
export async function DELETE(request: NextRequest) {
  try {
    const admin = createAdminClient();
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('session_id');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'session_id required' },
        { status: 400 }
      );
    }

    const { data, error } = await admin
      .from('video_sessions')
      .update({
        session_status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) throw error;

    // Log to history
    await admin.from('video_session_history').insert({
      session_id: sessionId,
      event_type: 'cancelled',
      event_data: { notes: 'Session cancelled' },
    });

    return NextResponse.json({ session: data });
  } catch (error) {
    console.error('Error cancelling video session:', error);
    return NextResponse.json(
      { error: 'Failed to cancel session' },
      { status: 500 }
    );
  }
}
