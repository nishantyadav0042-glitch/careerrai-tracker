import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { studentId, feedbackText, feedbackType = 'buddy_feedback' } = await request.json() as {
      studentId: string;
      feedbackText: string;
      feedbackType?: string;
    };

    if (!studentId || !feedbackText?.trim()) {
      return NextResponse.json({ error: 'studentId and feedbackText are required' }, { status: 400 });
    }
    if (feedbackText.trim().length > 2000) {
      return NextResponse.json({ error: 'Message too long (max 2000 chars)' }, { status: 400 });
    }
    if (feedbackType !== 'buddy_feedback' && feedbackType !== 'student_response') {
      return NextResponse.json({ error: 'Invalid feedbackType' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: student } = await admin
      .from('profiles')
      .select('id, full_name, buddy_id')
      .eq('id', studentId)
      .single();
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

    let buddyId: string;
    let recipientId: string;
    if (feedbackType === 'buddy_feedback') {
      if (student.buddy_id !== user.id) {
        return NextResponse.json({ error: 'This student is not assigned to you.' }, { status: 403 });
      }
      buddyId = user.id;
      recipientId = studentId;
    } else {
      if (user.id !== studentId) return NextResponse.json({ error: 'Not your conversation.' }, { status: 403 });
      if (!student.buddy_id) return NextResponse.json({ error: 'No buddy assigned yet.' }, { status: 400 });
      buddyId = student.buddy_id;
      recipientId = student.buddy_id;
    }

    const { data: sender } = await admin.from('profiles').select('full_name').eq('id', user.id).single();
    const senderFirst = sender?.full_name?.split(' ')[0] ?? 'Someone';

    const { data: row, error: insertError } = await admin
      .from('buddy_feedback')
      .insert({
        student_id: studentId,
        buddy_id: buddyId,
        feedback_text: feedbackText.trim(),
        feedback_type: 'text',
        feedback_date: new Date().toISOString().slice(0, 10),
        rating: 3,
        period_covered: 'adhoc',
      })
      .select('id')
      .single();

    if (insertError || !row) {
      console.error('buddy_feedback text insert failed:', insertError);
      return NextResponse.json({ error: "Couldn't save message — try again." }, { status: 500 });
    }

    await admin.from('notifications').insert({
      user_id: recipientId,
      type: 'text_feedback',
      title: `💬 ${senderFirst} sent you a message`,
      body: feedbackText.trim().slice(0, 100),
      data: { feedbackId: row.id },
    }).then(({ error: e }) => { if (e) console.error('Text feedback notification failed:', e.message); });

    return NextResponse.json({ success: true, feedbackId: row.id });
  } catch (error) {
    console.error('send-text error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
