import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/voice-notes/thanks { feedbackId }
 * One-tap ❤️ after listening — notifies the buddy their note landed.
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
      .select('id, student_id, buddy_id, feedback_type, thanked_at')
      .eq('id', feedbackId)
      .single();
    if (!row) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    // Only the student who received a buddy note can thank
    if (row.feedback_type !== 'buddy_feedback' || row.student_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (row.thanked_at) {
      return NextResponse.json({ success: true, already: true });
    }

    await admin
      .from('buddy_feedback')
      .update({ thanked_at: new Date().toISOString() })
      .eq('id', feedbackId);

    const { data: student } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single();
    const name = student?.full_name?.split(' ')[0] ?? 'Your student';

    await admin
      .from('notifications')
      .insert({
        user_id: row.buddy_id,
        type: 'voice_note_thanks',
        title: `❤️ ${name} listened to your voice note`,
        body: 'Your note landed. Keep them coming!',
        data: { feedbackId },
      })
      .then(({ error: e }) => {
        if (e) console.error('Thanks notification failed:', e.message);
      });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('thanks error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
