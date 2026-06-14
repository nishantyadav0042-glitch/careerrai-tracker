import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ChatThread } from '@/components/chat/chat-thread';
import { fetchPairMessages, resolvePair } from '@/lib/chat';

export const metadata = {
  title: 'Chat · CareerRai',
};

export default async function BuddyThreadPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  // Validates that this student is actually assigned to this buddy.
  const pair = await resolvePair(admin, user.id, studentId);
  if (!pair) redirect('/buddy/chat');

  const { data: student } = await admin
    .from('profiles')
    .select('full_name')
    .eq('id', pair.studentId)
    .single();

  const messages = await fetchPairMessages(admin, pair, 50);

  return (
    <ChatThread
      studentId={pair.studentId}
      buddyId={pair.buddyId}
      meId={user.id}
      otherName={student?.full_name ?? 'Student'}
      subtitle="Replies are delivered in real time."
      initialMessages={messages}
      sendStudentId={pair.studentId}
    />
  );
}
