import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { audit } from '@/lib/integration-audit';

export const dynamic = 'force-dynamic';

// Getting a file back out.
//
// The bucket is private, so this is the ONLY way to reach an attachment. The
// URL it returns is signed and short-lived: long enough to open a PDF, short
// enough that a link pasted into a group chat is dead by the time anyone else
// clicks it.
//
// Authorisation is by MESSAGE, not by path. The caller names a message id; we
// look up that message and check they are one of the two people in that
// conversation. Guessing another pair's message id gets a 404 — the same
// answer as a message that does not exist, so the endpoint cannot be used to
// discover which ids are real.

/** Long enough to open the file, short enough that a shared link goes stale. */
const SIGNED_URL_TTL_SECONDS = 120;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const { messageId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });

  const admin = createAdminClient();
  const { data: message } = await admin
    .from('chat_messages')
    .select('id, student_id, buddy_id, attachment_path, attachment_name, attachment_mime')
    .eq('id', messageId)
    .maybeSingle();

  if (!message?.attachment_path) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const isParticipant = user.id === message.student_id || user.id === message.buddy_id;
  if (!isParticipant) {
    // Worth logging loudly: a signed-in user asking for a conversation they
    // are not in is either a bug or someone probing.
    await audit({
      subjectId: user.id, action: 'chat.attachment_denied', ok: false,
      detail: { reason: 'not_a_participant', messageId },
    });
    // 404, not 403 — a 403 would confirm the message exists.
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const { data: signed, error } = await admin.storage
    .from('chat-attachments')
    .createSignedUrl(message.attachment_path, SIGNED_URL_TTL_SECONDS, {
      // Preserve the name the sender chose, rather than the random object key.
      download: message.attachment_name ?? undefined,
    });

  if (error || !signed) {
    console.error('[attachment] could not sign download:', error?.message);
    return NextResponse.json({ error: "Couldn't open that file — try again." }, { status: 502 });
  }

  return NextResponse.json({
    url: signed.signedUrl,
    name: message.attachment_name,
    mime: message.attachment_mime,
    expiresIn: SIGNED_URL_TTL_SECONDS,
  });
}
