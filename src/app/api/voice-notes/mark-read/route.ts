import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/voice-notes/mark-read { feedbackId }
 * First play: stamps read_at and clears the matching notification.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let feedbackId: string | undefined;
    try {
      ({ feedbackId } = await request.json());
    } catch {
      // validated below
    }
    if (!feedbackId) {
      return NextResponse.json({ error: 'feedbackId required' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: row } = await admin
      .from('buddy_feedback')
      .select('id, student_id, buddy_id, feedback_type, read_at')
      .eq('id', feedbackId)
      .single();
    if (!row) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Only the recipient can mark as read
    const recipientId =
      row.feedback_type === 'student_response' ? row.buddy_id : row.student_id;
    if (recipientId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!row.read_at) {
      await admin
        .from('buddy_feedback')
        .update({ read_at: new Date().toISOString() })
        .eq('id', feedbackId);

      // Clear the matching notification
      await admin
        .from('notifications')
        .update({ read: true })
        .eq('user_id', user.id)
        .eq('type', 'voice_note')
        .contains('data', { feedbackId });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('mark-read error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
