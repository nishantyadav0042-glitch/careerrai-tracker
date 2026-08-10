// ── The one path a message takes into a chat thread ─────────────────────────
//
// Two callers put messages into `chat_messages`: the composer (/api/chat/send)
// and the mentor's one-tap check-in (/api/buddy/checkin). They must behave
// identically — same block enforcement, same row shape, same push to the other
// side — because a check-in IS a real message from the mentor, not a
// notification wearing a mentor's name. The moment those two drift, a student
// can tell which messages were "system" ones, and the whole point is lost.
//
// So the insert-and-notify lives here once, and both routes call it.

import type { createAdminClient } from '@/lib/supabase/admin';
import { sendNotification } from '@/lib/notifications';
import { isBlockedPair } from '@/lib/chat-safety';
import type { ResolvedPair } from '@/lib/chat';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

const MESSAGE_COLUMNS =
  'id, student_id, buddy_id, sender_id, body, created_at, read_at, attachment_name, attachment_mime, attachment_size, attachment_kind';

/**
 * A block stops messages in BOTH directions (App Store 1.2 / Play UGC). A block
 * that only silences the person who filed it is not a block. Enforced on the
 * server: a UI-only block is a gesture, not a protection.
 */
export async function pairIsBlocked(admin: SupabaseAdmin, pair: ResolvedPair): Promise<boolean> {
  const { data } = await admin
    .from('chat_blocks')
    .select('blocker_id, blocked_id')
    .in('blocker_id', [pair.studentId, pair.buddyId])
    .in('blocked_id', [pair.studentId, pair.buddyId]);
  return isBlockedPair(data, pair.studentId, pair.buddyId);
}

export interface DeliverInput {
  admin: SupabaseAdmin;
  pair: ResolvedPair;
  senderId: string;
  body: string;
  /** Already-verified attachment columns, or nothing. */
  attachmentColumns?: Record<string, unknown>;
}

/**
 * Insert the message and push it to the other side. Returns the row, or the
 * insert error for the caller to handle (the composer has an attachment to
 * clean up when this fails; the check-in does not).
 */
export async function deliverPairMessage(input: DeliverInput) {
  const { admin, pair, senderId, body, attachmentColumns } = input;

  const { data: message, error } = await admin
    .from('chat_messages')
    .insert({
      student_id: pair.studentId,
      buddy_id: pair.buddyId,
      sender_id: senderId,
      body,
      ...(attachmentColumns ?? {}),
    })
    .select(MESSAGE_COLUMNS)
    .single();

  if (error || !message) return { message: null, error };

  // A message FROM the student answers any check-in that was sent to them.
  //
  // This lives here rather than in the composer route on purpose: the
  // "unanswered check-ins" count is what stops us drafting a third personal
  // message to someone who never replies, and if a future caller forgot to
  // stamp it we would keep messaging a student who has been replying all along.
  // Best-effort — a failed stamp must never fail the message.
  if (senderId === pair.studentId) {
    void admin
      .from('buddy_checkin_drafts')
      .update({ replied_at: new Date().toISOString() })
      .eq('student_id', pair.studentId)
      .not('sent_at', 'is', null)
      .is('replied_at', null)
      .then(undefined, () => {});
  }

  // Best-effort notification to the recipient (the other member of the pair).
  const recipientId = senderId === pair.studentId ? pair.buddyId : pair.studentId;
  const hasAttachment = !!attachmentColumns && Object.keys(attachmentColumns).length > 0;
  void (async () => {
    try {
      const { data: sender } = await admin
        .from('profiles')
        .select('full_name')
        .eq('id', senderId)
        .single();
      const senderName = sender?.full_name?.split(' ')[0] ?? 'your buddy';
      const preview =
        body.length > 80 ? `${body.slice(0, 80)}…` : body || (hasAttachment ? '📎 Sent you a file' : '');
      // Deep-link each side to THEIR chat screen — a buddy tapping the push
      // must land on the buddy chat, not the student page.
      const recipientIsBuddy = recipientId === pair.buddyId;
      await sendNotification({
        userId: recipientId,
        type: 'chat',
        title: `${senderName} sent you a message 💬`,
        body: preview,
        channels: ['in_app', 'push'],
        data: {
          url: recipientIsBuddy ? `/buddy/chat/${pair.studentId}` : '/student/buddy?tab=chat',
          student_id: pair.studentId,
          buddy_id: pair.buddyId,
        },
      });
    } catch {
      // non-blocking
    }
  })();

  return { message, error: null };
}
