import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolvePair } from '@/lib/chat';
import { pairIsBlocked, deliverPairMessage } from '@/lib/chat-deliver';
import { serverError } from '@/lib/api-error';
import { audit } from '@/lib/integration-audit';

// The mentor's one tap.
//
// The cron drafted the message; this is where a human decides to send it. Two
// rules are enforced here rather than trusted to the UI:
//
//  · The message goes out under the mentor's own id, through the same
//    deliverPairMessage() the composer uses. It is a real message in the real
//    thread — the student can reply to it, the mentor sees the reply, and no
//    surface anywhere marks it as machine-written. That is the whole point.
//  · A draft that has expired cannot be sent. "Do din se log nahi dikha" was
//    true on Monday morning; sending it on Wednesday from a mentor's id is the
//    system lying about having noticed.
export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let payload: { draftId?: unknown; action?: unknown; body?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const draftId = typeof payload.draftId === 'string' ? payload.draftId : '';
  const action = payload.action === 'dismiss' ? 'dismiss' : 'send';
  if (!draftId) return NextResponse.json({ error: 'draftId required' }, { status: 400 });

  const admin = createAdminClient();
  const { data: draft } = await admin
    .from('buddy_checkin_drafts')
    .select('id, buddy_id, student_id, draft_body, signal, expires_at, sent_at, dismissed_at')
    .eq('id', draftId)
    .single();

  if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (draft.buddy_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (draft.sent_at) return NextResponse.json({ error: 'Already sent' }, { status: 409 });
  if (draft.dismissed_at) return NextResponse.json({ error: 'Already dismissed' }, { status: 409 });

  if (action === 'dismiss') {
    await admin
      .from('buddy_checkin_drafts')
      .update({ dismissed_at: new Date().toISOString() })
      .eq('id', draft.id);
    return NextResponse.json({ ok: true, dismissed: true });
  }

  if (Date.parse(draft.expires_at) <= Date.now()) {
    // Close it out rather than leaving a dead card on the mentor's screen.
    await admin
      .from('buddy_checkin_drafts')
      .update({ dismissed_at: new Date().toISOString() })
      .eq('id', draft.id);
    return NextResponse.json(
      { error: 'expired', message: 'This check-in is out of date — message them directly instead.' },
      { status: 409 }
    );
  }

  // The mentor may rewrite any of it. Their words beat ours.
  const edited = typeof payload.body === 'string' ? payload.body.trim() : '';
  const body = edited || draft.draft_body;
  if (body.length < 1 || body.length > 2000) {
    return NextResponse.json({ error: 'Message must be 1–2000 characters' }, { status: 400 });
  }

  // Re-verify the pairing at send time: a student may have been reassigned
  // between the 9:30 AM draft and this tap, and a message from the wrong
  // mentor is worse than no message.
  const pair = await resolvePair(admin, user.id, draft.student_id);
  if (!pair) {
    await admin
      .from('buddy_checkin_drafts')
      .update({ dismissed_at: new Date().toISOString() })
      .eq('id', draft.id);
    return NextResponse.json({ error: 'Not paired' }, { status: 403 });
  }
  if (await pairIsBlocked(admin, pair)) {
    await admin
      .from('buddy_checkin_drafts')
      .update({ dismissed_at: new Date().toISOString() })
      .eq('id', draft.id);
    return NextResponse.json({ error: 'blocked' }, { status: 403 });
  }

  const { message, error } = await deliverPairMessage({
    admin, pair, senderId: user.id, body,
  });
  if (error || !message) return serverError('buddy-checkin-send', error);

  await admin
    .from('buddy_checkin_drafts')
    .update({ sent_at: new Date().toISOString(), message_id: message.id, draft_body: body })
    .eq('id', draft.id);

  await audit({
    subjectId: draft.student_id,
    action: 'buddy.checkin_sent',
    detail: { draftId: draft.id, signal: draft.signal, edited: !!edited, messageId: message.id },
  });

  return NextResponse.json({ ok: true, message });
}
