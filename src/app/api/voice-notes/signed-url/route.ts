import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Extract the storage path from either a stored path or a legacy full public URL.
function storagePath(urlOrPath: string): string {
  const marker = '/object/public/voice-notes/';
  const idx = urlOrPath.indexOf(marker);
  return idx >= 0 ? urlOrPath.slice(idx + marker.length) : urlOrPath;
}

/**
 * POST /api/voice-notes/signed-url { feedbackId }
 * Returns a 1-hour signed URL for the voice note.
 * Caller must be the student or buddy in the feedback row.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let feedbackId: string | undefined;
    try {
      ({ feedbackId } = await request.json());
    } catch {
      // validated below
    }
    if (!feedbackId) return NextResponse.json({ error: 'feedbackId required' }, { status: 400 });

    const admin = createAdminClient();
    const { data: row, error: rowError } = await admin
      .from('buddy_feedback')
      .select('student_id, buddy_id, voice_note_url')
      .eq('id', feedbackId)
      .single();

    if (rowError) {
      console.error('signed-url db error:', rowError.message);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
    if (!row || !row.voice_note_url) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Only the student or the assigned buddy can get the signed URL.
    if (user.id !== row.student_id && user.id !== row.buddy_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const path = storagePath(row.voice_note_url);
    const { data, error } = await admin.storage
      .from('voice-notes')
      .createSignedUrl(path, 3600); // 1-hour expiry

    if (error || !data?.signedUrl) {
      console.error('signed-url error:', error);
      return NextResponse.json({ error: 'Could not generate URL' }, { status: 500 });
    }

    return NextResponse.json({ url: data.signedUrl });
  } catch (error) {
    console.error('signed-url route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
