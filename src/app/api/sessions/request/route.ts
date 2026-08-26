import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { dispatch } from '@/lib/notification-os';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { buddyId, message } = await request.json();
    if (!buddyId) {
      return NextResponse.json({ error: 'buddyId required' }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: studentProfile } = await admin
      .from('profiles')
      .select('full_name, buddy_id')
      .eq('id', user.id)
      .single();

    // Authorization: a student may only ping THEIR OWN assigned buddy. Without
    // this a student could POST any user id as buddyId and inject an
    // "🚨 Urgent help needed" notification (with free-text) to an arbitrary
    // account, and bind a session_request to a buddy they were never matched
    // with. buddy_id is the single source of truth for the pairing.
    if (!studentProfile?.buddy_id || studentProfile.buddy_id !== buddyId) {
      return NextResponse.json({ error: 'Not your buddy' }, { status: 403 });
    }

    const firstName = studentProfile?.full_name?.split(' ')[0] ?? 'A student';

    const { data: req, error: insertError } = await admin
      .from('session_requests')
      .insert({
        student_id: user.id,
        buddy_id: buddyId,
        message: message?.trim() || null,
        status: 'pending',
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Error inserting session request:', insertError);
      return NextResponse.json({ error: 'Failed to create request' }, { status: 500 });
    }

    // Through dispatch() — an urgent request that only ever existed as an
    // unread bell row defeated its own urgency. The buddy's phone is the point.
    const { data: buddyProf } = await admin
      .from('profiles').select('notif_prefs').eq('id', buddyId).single();
    await dispatch({
      userId: buddyId,
      type: 'session_request',
      title: '🚨 Urgent help needed',
      body: message?.trim()
        ? `${firstName} needs your help: "${message.trim().substring(0, 80)}"`
        : `${firstName} requested an urgent session.`,
      url: '/buddy/home',
      data: { studentId: user.id, requestId: req.id },
      reason: 'Student explicitly asked for urgent help — the one ask that must never sit unseen',
      expectedAction: 'view_session',
      prefs: (buddyProf?.notif_prefs as Record<string, unknown>) ?? {},
    });

    return NextResponse.json({ success: true, requestId: req.id });
  } catch (error) {
    console.error('Error handling session request:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { requestId } = await request.json();
    if (!requestId) return NextResponse.json({ error: 'requestId required' }, { status: 400 });

    const admin = createAdminClient();
    await admin
      .from('session_requests')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', requestId)
      .eq('buddy_id', user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH session request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
