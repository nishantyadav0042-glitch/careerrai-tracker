import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPremium } from '@/lib/access';
import { readPremiumProfile } from '@/lib/premium';
import { BuddyConversionScreen } from '@/components/buddy/buddy-conversion-screen';
import { getRecommendedBuddiesForStudent } from '@/lib/buddy-match';
import { loadStudentCase } from '@/lib/buddy-case-data';
import { getChatUnreadCount } from '@/lib/chat-unread';
import { sessionsVisibleFrom } from '@/lib/session-window';
import { fetchPairMessages } from '@/lib/chat';
import { BuddyOverview } from './buddy-overview';
import { BuddyPanelTabs } from '@/components/buddy-panel-tabs';
import { ChatThread } from '@/components/chat/chat-thread';
import { SessionDebrief } from '@/components/student/session-debrief';

export const metadata = {
  title: 'Buddy · CareerRai',
  description: 'Everything between you and your buddy — sessions, feedback, chat',
};

// Buddy and Chat used to be two separate bottom-nav destinations for the
// same relationship. Merged: one screen, two tabs — Buddy (sessions,
// feedback) and Chat (messages), instead of splitting
// "everything about your buddy" across two nav slots.
export default async function BuddyPage({
  searchParams,
}: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  await searchParams;
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  // Through the throwing primitive (Boundary 2, change 2). The old inline
  // read ignored its error, so one flaky read rendered a PAYING student the
  // locked page with a "Rs 299 — book now" button. UNKNOWN now surfaces as
  // the error boundary — retryable and honest — and the locked experience
  // below can only ever be reached by a premium answer we actually received.
  const profile = await readPremiumProfile(admin, user.id);

  // Freemium (rebuilt 14 Aug, founder: "buddy screen is too much — keep only
  // the student's weakness, the buddy profile + why, and ₹299 book now").
  // Three blocks: their own diagnosed weaknesses, ONE matched mentor with the
  // reason, one price. LockedBuddyHub (fear hero, USP stack, price cards) is
  // retired from this route; the Till-CAT plan survives as one line.
  if (!isPremium(profile)) {
    const [recommendedBuddies, studentCase] = await Promise.all([
      getRecommendedBuddiesForStudent(admin, user.id),
      loadStudentCase(admin, user.id),
    ]);
    return (
      <BuddyConversionScreen
        firstName={(profile?.full_name ?? 'there').split(' ')[0]}
        findings={studentCase.findings}
        bullets={studentCase.bullets}
        gapCount={studentCase.gapCount}
        buddy={recommendedBuddies[0] ?? null}
        topKind={studentCase.topKind}
      />
    );
  }

  const buddyId = profile?.buddy_id ?? null;
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 86_400_000).toISOString();

  const [{ data: buddy }, { data: upcoming }, { data: recentCompleted }, { data: pendingRequests }, { data: feedbackRows }, chatUnread, messages, { data: debrief }, { data: assignments }] = await Promise.all([
    buddyId
      ? admin.from('profiles').select('full_name, college, cat_percentile, buddy_bio, avatar_url').eq('id', buddyId).single()
      : Promise.resolve({ data: null }),
    // Upcoming: scheduled sessions + 1h grace window
    admin
      .from('video_sessions')
      .select('id, title, scheduled_at, google_meet_link, session_status, session_type')
      .eq('student_id', user.id)
      // 'active' BELONGS HERE (24 Aug). A session the mentor has STARTED is
      // the most live a session ever gets — filtering to 'scheduled' alone
      // would make the Join button vanish at the exact moment the call began.
      // Same failure as the 4 Aug grace-window incident, one state later.
      .in('session_status', ['scheduled', 'active'])
      .gte('scheduled_at', sessionsVisibleFrom(now))
      .order('scheduled_at', { ascending: true })
      // Tie-break: two sessions at the same minute must resolve IDENTICALLY on
      // the student's phone and the buddy's, or they join different rooms.
      .order('created_at', { ascending: false })
      .limit(5),
    // Completed within last 7 days — dashboard cleanup: older sessions go to History
    // VIEW FILTER ONLY — no data is ever deleted, all sessions persist forever
    admin
      .from('video_sessions')
      .select('id, title, scheduled_at, session_type, session_status')
      .eq('student_id', user.id)
      .eq('session_status', 'completed')
      .gte('scheduled_at', sevenDaysAgo)
      .order('scheduled_at', { ascending: false })
      .limit(5),
    buddyId
      ? admin
          .from('session_requests')
          .select('id, message, created_at, status')
          .eq('student_id', user.id)
          .eq('buddy_id', buddyId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1)
      : Promise.resolve({ data: [] }),
    // Pre-fetch buddy feedback to avoid a second client-side loading phase
    buddyId
      ? admin
          .from('buddy_feedback')
          .select(`
            id,
            feedback_text,
            created_at,
            buddy_id,
            read_at,
            thanked_at,
            profiles!buddy_feedback_buddy_id_fkey(full_name, college)
          `)
          .eq('student_id', user.id)
          .eq('buddy_id', buddyId)
          .in('feedback_type', ['buddy_note', 'text'])
          .neq('buddy_id', user.id)
          .order('created_at', { ascending: false })
          .limit(3)
      : Promise.resolve({ data: [] }),
    getChatUnreadCount(user.id, 'student'),
    buddyId ? fetchPairMessages(admin, { studentId: user.id, buddyId }, 50) : Promise.resolve([]),
    // The last call's debrief: one strength, one thing to fix.
    buddyId
      ? admin
          .from('session_commitments')
          .select('strength, weakness, created_at')
          .eq('student_id', user.id)
          .eq('buddy_id', buddyId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    // Open tasks first; recently ticked ones stay visible so finishing the
    // list feels like finishing something.
    buddyId
      ? admin
          .from('session_assignments')
          .select('id, task, completed_at')
          .eq('student_id', user.id)
          .order('created_at', { ascending: false })
          .order('position', { ascending: true })
          .limit(4)
      : Promise.resolve({ data: [] }),
  ]);

  const buddyName = buddy?.full_name?.split(' ')[0] ?? 'your buddy';
  const buddyInitials = buddy
    ? (buddy.full_name ?? '').split(' ').map((n: string) => n[0]).filter(Boolean).join('').slice(0, 2).toUpperCase() || '?'
    : '';
  const hasPendingRequest = (pendingRequests?.length ?? 0) > 0;
  const sessions = [...(upcoming ?? []), ...(recentCompleted ?? [])];


  const nextSession = (upcoming ?? [])[0] ?? null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white p-4 sm:p-6">
      <div className="max-w-md mx-auto pb-24">
        {/*
          The student Google-connect card is DELIBERATELY not rendered.

          It sold one benefit: a calendar invite for each session. The
          permanent-room architecture (founder, 5 Aug) stopped creating a
          calendar event per booking, so connecting Google now buys a student
          nothing. The component and the /api/google/* routes are kept intact —
          restoring the card is this one line — but we do not ask students for
          a Google account in exchange for a promise the app no longer keeps.
        */}
        {buddyId && (
          <SessionDebrief
            buddyFirstName={buddyName}
            strength={debrief?.strength ?? null}
            weakness={debrief?.weakness ?? null}
            tasks={(assignments ?? []).map((a) => ({ id: a.id, task: a.task, completedAt: a.completed_at }))}
          />
        )}
        <BuddyPanelTabs
          chatUnread={chatUnread}
          overview={
            <BuddyOverview
              studentId={user.id}
              buddy={buddy}
              buddyId={buddyId}
              buddyName={buddyName}
              buddyInitials={buddyInitials}
              sessions={sessions}
              nextSession={nextSession}
              hasPendingRequest={hasPendingRequest}
              feedbackRows={feedbackRows}
              now={now}
            />
          }
          chat={
            buddyId ? (
              <ChatThread
                studentId={user.id}
                buddyId={buddyId}
                meId={user.id}
                otherName={buddy?.full_name ?? 'Your buddy'}
                initialMessages={messages}
                embedded
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="rounded-2xl border border-stone-200 bg-stone-50 p-8 text-center max-w-sm">
                  <p className="text-stone-600 font-medium">Your buddy is being matched</p>
                  <p className="text-sm text-stone-400 mt-1">Chat opens once you&apos;re paired.</p>
                </div>
              </div>
            )
          }
        />
      </div>
    </div>
  );
}
