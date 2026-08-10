import { createAdminClient } from '@/lib/supabase/admin';
import type { ChatMessage } from '@/components/chat/types';

export interface ResolvedPair {
  studentId: string;
  buddyId: string;
}

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

/**
 * Resolve and validate the chat pair for an authenticated user.
 *
 * - If the user is a student, the pair is (self, self.buddy_id). `studentId` is ignored.
 * - If the user is a buddy, `studentId` is required and that student's
 *   `buddy_id` must equal the buddy's own id.
 *
 * Returns null if the user has no role, is unpaired, or the pairing does not check out.
 * NEVER trusts client-provided pair identity beyond the authenticated user id.
 */
export async function resolvePair(
  admin: SupabaseAdmin,
  userId: string,
  studentId?: string | null
): Promise<ResolvedPair | null> {
  const { data: me } = await admin
    .from('profiles')
    .select('id, role, buddy_id')
    .eq('id', userId)
    .single();

  if (!me) return null;

  if (me.role === 'student') {
    if (!me.buddy_id) return null;
    return { studentId: me.id, buddyId: me.buddy_id };
  }

  if (me.role === 'buddy') {
    if (!studentId) return null;
    const { data: student } = await admin
      .from('profiles')
      .select('id, buddy_id')
      .eq('id', studentId)
      .single();
    if (!student || student.buddy_id !== me.id) return null;
    return { studentId: student.id, buddyId: me.id };
  }

  return null;
}

/** Fetch the most recent `limit` messages for a pair, returned chronologically (oldest first). */
export async function fetchPairMessages(
  admin: SupabaseAdmin,
  pair: ResolvedPair,
  limit = 50
): Promise<ChatMessage[]> {
  const { data } = await admin
    .from('chat_messages')
    // attachment_path is deliberately NOT selected — it never leaves the
    // server. Clients fetch a short-lived signed URL by message id instead.
    .select('id, student_id, buddy_id, sender_id, body, created_at, read_at, attachment_name, attachment_mime, attachment_size, attachment_kind, deleted_at')
    .eq('student_id', pair.studentId)
    .eq('buddy_id', pair.buddyId)
    .order('created_at', { ascending: false })
    .limit(limit);

  const rows = (data ?? []) as ChatMessage[];
  return rows.reverse();
}
