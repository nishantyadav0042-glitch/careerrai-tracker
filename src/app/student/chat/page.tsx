import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthUser } from '@/lib/auth';
import { ChatThread } from '@/components/chat/chat-thread';
import { fetchPairMessages } from '@/lib/chat';
import { isPremium } from '@/lib/access';
import { LockedBuddyHub } from '@/components/locked-buddy-hub';
import { getRecommendedBuddiesForStudent } from '@/lib/buddy-match';

export const metadata = {
  title: 'Chat · CareerRai',
  description: 'Text chat with your buddy',
};

export default async function StudentChatPage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('full_name, buddy_id, is_premium')
    .eq('id', user.id)
    .single();

  // Freemium paywall: chatting with the buddy is premium-only.
  if (!isPremium(profile)) {
    const recommendedBuddies = await getRecommendedBuddiesForStudent(admin, user.id);
    return <LockedBuddyHub variant="chat" fullName={profile?.full_name ?? undefined} recommendedBuddies={recommendedBuddies} />;
  }

  const buddyId = profile?.buddy_id ?? null;

  if (!buddyId) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="rounded-2xl border border-stone-200 bg-stone-50 p-8 text-center max-w-sm">
          <p className="text-stone-600 font-medium">Your buddy is being matched</p>
          <p className="text-sm text-stone-400 mt-1">Chat opens once you&apos;re paired.</p>
        </div>
      </div>
    );
  }

  const { data: buddy } = await admin
    .from('profiles')
    .select('full_name')
    .eq('id', buddyId)
    .single();

  const pair = { studentId: user.id, buddyId };
  const messages = await fetchPairMessages(admin, pair, 50);

  return (
    <ChatThread
      studentId={user.id}
      buddyId={buddyId}
      meId={user.id}
      otherName={buddy?.full_name ?? 'Your buddy'}
      initialMessages={messages}
    />
  );
}
