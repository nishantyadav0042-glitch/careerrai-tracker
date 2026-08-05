import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolvePair } from '@/lib/chat';
import { isBlockedPair } from '@/lib/chat-safety';
import { audit } from '@/lib/integration-audit';
import { validateDeclaredFile, attachmentPath } from '@/lib/chat-attachments';

export const dynamic = 'force-dynamic';

// Step 1 of sending an attachment: get somewhere to put it.
//
// The file does NOT travel through this route. Vercel caps a serverless
// request body at ~4.5 MB, so a 20 MB document could not be posted here at
// all — direct-to-storage is a requirement, not a preference. It also gives
// the browser a real progress bar and a working cancel, which a single opaque
// POST cannot.
//
// What this route does is decide WHETHER to allow an upload and WHERE it may
// go. The caller is proven to be a member of the conversation, the declared
// file is checked against the allowlist, and the object key is chosen by us —
// never by the client, so a crafted filename cannot escape the pair's folder.
//
// The bytes are checked again, for real, when the message is sent.
export async function POST(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });

  let payload: { filename?: unknown; mime?: unknown; size?: unknown; studentId?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const filename = typeof payload.filename === 'string' ? payload.filename : '';
  const mime = typeof payload.mime === 'string' ? payload.mime : '';
  const size = typeof payload.size === 'number' ? payload.size : NaN;
  const studentId = typeof payload.studentId === 'string' ? payload.studentId : undefined;

  const admin = createAdminClient();

  // Membership first: an outsider must not even learn whether a file type is
  // allowed here, let alone receive a writable URL.
  const pair = await resolvePair(admin, user.id, studentId);
  if (!pair) {
    await audit({
      subjectId: user.id, action: 'chat.attachment_denied', ok: false,
      detail: { reason: 'not_a_participant', studentId: studentId ?? null },
    });
    return NextResponse.json({ error: 'You are not part of this conversation.' }, { status: 403 });
  }

  const { data: blockRows } = await admin
    .from('chat_blocks')
    .select('blocker_id, blocked_id')
    .in('blocker_id', [pair.studentId, pair.buddyId])
    .in('blocked_id', [pair.studentId, pair.buddyId]);
  if (isBlockedPair(blockRows, pair.studentId, pair.buddyId)) {
    return NextResponse.json({ error: 'This conversation is blocked.' }, { status: 403 });
  }

  const check = validateDeclaredFile(filename, mime, size);
  if (!check.ok) {
    await audit({
      subjectId: user.id, action: 'chat.attachment_rejected', ok: false,
      detail: { reason: check.error, mime, size, extension: filename.split('.').pop() ?? null },
    });
    return NextResponse.json({ error: check.error }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const path = attachmentPath(pair.studentId, pair.buddyId, id, check.extension);

  const { data: signed, error } = await admin.storage
    .from('chat-attachments')
    .createSignedUploadUrl(path);

  if (error || !signed) {
    console.error('[attachment] could not sign upload:', error?.message);
    return NextResponse.json({ error: "Couldn't start the upload — try again." }, { status: 502 });
  }

  // Bookkeeping so an abandoned upload can be found and deleted later. Not
  // fatal if it fails — a missed row costs one orphaned file, while failing
  // the upload over it costs the user their attachment.
  const { error: intentError } = await admin
    .from('attachment_uploads')
    .insert({ path, user_id: user.id });
  if (intentError) console.error('[attachment] intent not recorded:', intentError.message);

  return NextResponse.json({
    uploadUrl: signed.signedUrl,
    token: signed.token,
    path,
    kind: check.kind,
    mime: check.mime,
  });
}
