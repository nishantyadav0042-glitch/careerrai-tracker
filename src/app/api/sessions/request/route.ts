import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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
      .select('full_name')
      .eq('id', user.id)
      .single();

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

    await admin.from('notifications').insert({
      user_id: buddyId,
      type: 'session_request',
      title: '🚨 Urgent help needed',
      body: message?.trim()
        ? `${firstName} needs your help: "${message.trim().substring(0, 80)}"`
        : `${firstName} requested an urgent session.`,
      data: { studentId: user.id, requestId: req.id, url: '/buddy/home' },
      read: false,
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
