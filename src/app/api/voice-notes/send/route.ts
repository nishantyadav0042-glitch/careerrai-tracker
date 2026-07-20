import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { liveStreak } from '@/lib/streak-utils';

const MAX_BYTES = 15 * 1024 * 1024; // ~15MB ≈ well over 90s of opus

const EXT_BY_MIME: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
};

/**
 * POST /api/voice-notes/send  (multipart/form-data)
 * Fields: audio (File), studentId, durationSeconds, feedbackType
 * Buddy → student ('buddy_feedback') or student → buddy ('student_response').
 * Uploads server-side, inserts the feedback row, notifies the recipient.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: 'Invalid upload.' }, { status: 400 });
    }

    const audio = form.get('audio');
    const studentId = form.get('studentId');
    const feedbackType = form.get('feedbackType') || 'buddy_feedback';
    const durationSeconds = Number(form.get('durationSeconds')) || null;

    if (!(audio instanceof File) || typeof studentId !== 'string' || !studentId) {
      return NextResponse.json(
        { error: 'audio file and studentId are required.' },
        { status: 400 }
      );
    }
    if (feedbackType !== 'buddy_feedback' && feedbackType !== 'student_response') {
      return NextResponse.json({ error: 'Invalid feedbackType.' }, { status: 400 });
    }
    if (audio.size === 0 || audio.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Audio file is empty or too large.' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Resolve sender/recipient and authorize the pair
    const { data: student } = await admin
      .from('profiles')
      .select('id, full_name, buddy_id, current_streak, last_log_date')
      .eq('id', studentId)
      .single();
    if (!student) {
      return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
    }

    let buddyId: string;
    let recipientId: string;
    if (feedbackType === 'buddy_feedback') {
      // sender must be the student's buddy
      if (student.buddy_id !== user.id) {
        return NextResponse.json(
          { error: 'This student is not assigned to you.' },
          { status: 403 }
        );
      }
      buddyId = user.id;
      recipientId = studentId;
    } else {
      // student_response: sender must be the student, recipient their buddy
      if (user.id !== studentId) {
        return NextResponse.json({ error: 'Not your conversation.' }, { status: 403 });
      }
      if (!student.buddy_id) {
        return NextResponse.json({ error: 'No buddy assigned yet.' }, { status: 400 });
      }
      buddyId = student.buddy_id;
      recipientId = student.buddy_id;
    }

    const { data: sender } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single();
    const senderFirst = sender?.full_name?.split(' ')[0] ?? 'Someone';

    // Upload
    const baseMime = (audio.type || 'audio/webm').split(';')[0];
    const ext = EXT_BY_MIME[baseMime] ?? 'webm';
    const path = `${studentId}/${Date.now()}.${ext}`;
    const bytes = await audio.arrayBuffer();

    const { error: uploadError } = await admin.storage
      .from('voice-notes')
      .upload(path, bytes, { contentType: baseMime, cacheControl: '3600' });
    if (uploadError) {
      console.error('Voice note upload failed:', uploadError);
      return NextResponse.json(
        { error: "Upload didn't go through — try again." },
        { status: 502 }
      );
    }

    const { data: row, error: insertError } = await admin
      .from('buddy_feedback')
      .insert({
        student_id: studentId,
        buddy_id: buddyId,
        voice_note_url: path, // Store storage path; served via /api/voice-notes/signed-url
        feedback_type: feedbackType,
        feedback_date: new Date().toISOString().slice(0, 10),
        feedback_text: 'Voice message',
        rating: 3,
        period_covered: 'adhoc',
        duration_seconds: durationSeconds,
        mime_type: baseMime,
      })
      .select('id')
      .single();

    if (insertError || !row) {
      console.error('buddy_feedback insert failed:', insertError);
      await admin.storage.from('voice-notes').remove([path]).catch(() => {});
      return NextResponse.json(
        { error: "Couldn't save the note — try again." },
        { status: 500 }
      );
    }

    // Notify recipient (non-fatal)
    await admin
      .from('notifications')
      .insert({
        user_id: recipientId,
        type: 'voice_note',
        title: `🎤 ${senderFirst} sent you a voice note`,
        body:
          feedbackType === 'buddy_feedback'
            ? 'Your buddy recorded something for you — listen in the Buddy tab.'
            : `${senderFirst} replied to your note.`,
        data: { feedbackId: row.id, url: '/student/buddy' },
      })
      .then(({ error: e }) => {
        if (e) console.error('Voice note notification failed:', e.message);
      });

    return NextResponse.json({
      success: true,
      feedbackId: row.id,
      // little human nudge for the buddy UI
      streakNudge:
        feedbackType === 'buddy_feedback' && liveStreak(student.current_streak, student.last_log_date) >= 7
          ? `Nice — ${student.full_name.split(' ')[0]} is on a ${liveStreak(student.current_streak, student.last_log_date)}-day streak, this is a great moment.`
          : null,
    });
  } catch (error) {
    console.error('voice-notes/send error:', error);
    return NextResponse.json(
      { error: "Couldn't send the note — try again." },
      { status: 500 }
    );
  }
}
