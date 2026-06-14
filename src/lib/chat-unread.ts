import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Total unread chat messages for a user (messages addressed to them that they
 * haven't read). Works for both students and buddies: a message is "unread for
 * me" when I am a pair member, I'm not the sender, and read_at is null.
 *
 * Counts via head/count to stay cheap. Returns 0 on any error.
 */
export async function getChatUnreadCount(userId: string, role: 'student' | 'buddy'): Promise<number> {
  const admin = createAdminClient();
  const column = role === 'student' ? 'student_id' : 'buddy_id';

  const { count, error } = await admin
    .from('chat_messages')
    .select('id', { count: 'exact', head: true })
    .eq(column, userId)
    .neq('sender_id', userId)
    .is('read_at', null);

  if (error || count === null) return 0;
  return count;
}
