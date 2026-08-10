import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { discardAttachment } from '@/lib/chat-attachment-verify';
import { audit } from '@/lib/integration-audit';

export const dynamic = 'force-dynamic';

// Delete-for-everyone (Shreya's ask, 10 Aug): the SENDER of a message — student
// or mentor — may delete it. WhatsApp-style soft delete: the row stays as a
// tombstone so the thread's shape is honest, but the text is wiped for both
// sides and any attachment object is removed from storage immediately (a
// deleted message must not keep a downloadable file alive).
//
// Only your OWN messages, ever — a mentor deleting a student's words (or vice
// versa) would be rewriting someone else's record.
export async function POST(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });

  let body: { messageId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const messageId = typeof body.messageId === 'string' ? body.messageId : '';
  if (!messageId) return NextResponse.json({ error: 'Missing messageId.' }, { status: 400 });

  const admin = createAdminClient();
  const { data: msg } = await admin
    .from('chat_messages')
    .select('id, sender_id, attachment_path, deleted_at')
    .eq('id', messageId)
    .maybeSingle();

  if (!msg) return NextResponse.json({ error: 'Message not found.' }, { status: 404 });
  if (msg.sender_id !== user.id) {
    await audit({
      subjectId: user.id, action: 'chat.delete_denied', ok: false,
      detail: { messageId, reason: 'not_sender' },
    });
    return NextResponse.json({ error: 'You can only delete your own messages.' }, { status: 403 });
  }
  // Already deleted → idempotent success (a double-tap is not an error).
  if (msg.deleted_at) return NextResponse.json({ ok: true });

  const hadAttachment = !!msg.attachment_path;
  const { error } = await admin
    .from('chat_messages')
    .update({
      deleted_at: new Date().toISOString(),
      body: '',
      attachment_path: null, attachment_name: null, attachment_mime: null,
      attachment_size: null, attachment_kind: null,
    })
    .eq('id', messageId)
    .eq('sender_id', user.id);
  if (error) return NextResponse.json({ error: 'Could not delete — try again.' }, { status: 500 });

  if (hadAttachment) {
    await discardAttachment(String(msg.attachment_path));
    await admin.from('attachment_uploads').delete().eq('path', String(msg.attachment_path));
  }

  await audit({
    subjectId: user.id, action: 'chat.message_deleted',
    detail: { messageId, hadAttachment },
  });

  return NextResponse.json({ ok: true });
}
