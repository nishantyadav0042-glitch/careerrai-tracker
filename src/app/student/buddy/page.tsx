import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPremium } from '@/lib/access';
import { BuddyPitch, type BuddyPitchData } from '@/components/buddy-pitch';
import { getRecommendedBuddiesForStudent } from '@/lib/buddy-match';
import { resolveCatExamDate } from '@/lib/routine-engine';
import { TOPIC_METADATA } from '@/lib/topics-constants';
import { getChatUnreadCount } from '@/lib/chat-unread';
import { fetchPairMessages } from '@/lib/chat';
import { BuddyOverview } from './buddy-overview';
import { BuddyPanelTabs } from '@/components/buddy-panel-tabs';
import { ChatThread } from '@/components/chat/chat-thread';

export const metadata = {
  title: 'Buddy · CareerRai',
  description: 'Everything between you and your buddy — sessions, feedback, chat',
};

// Buddy and Chat used to be two separate bottom-nav destinations for the
// same relationship. Merged: one screen, two tabs — Buddy (sessions,
// feedback, voice notes) and Chat (messages), instead of splitting
// "everything about your buddy" across two nav slots.
export default async function BuddyPage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('full_name, buddy_id, is_premium')
    .eq('id', user.id)
    .single();

  // Freemium: free users get the Buddy conversion dashboard — an indirect sales
  // asset built from their OWN numbers (mock sprint, revision plan, consistency),
  // with the Buddy positioned as the enabler at each pain point.
  if (!isPremium(profile)) {
    const nowD = new Date();
    const fourteenAgo = new Date(nowD.getTime() - 14 * 86_400_000).toISOString().split('T')[0];
    const weekAgoIso = new Date(nowD.getTime() - 7 * 86_400_000).toISOString();
    const [{ data: reports }, { data: coverageRows }, { data: streakRow }, { data: xp }, recommendedBuddies] = await Promise.all([
      admin.from('daily_reports').select('report_date, study_duration, mock_taken').eq('student_id', user.id).limit(500),
      admin.from('topic_coverage').select('status, updated_at').eq('student_id', user.id),
      admin.from('streak_data').select('current_streak').eq('student_id', user.id).maybeSingle(),
      admin.from('profiles').select('attempt_year, self_reported_weakest_section').eq('id', user.id).single(),
      getRecommendedBuddiesForStudent(admin, user.id),
    ]);

    const cat = resolveCatExamDate(nowD, (xp?.attempt_year as number | null) ?? null);
    const daysToCat = Math.max(0, Math.ceil((cat.getTime() - nowD.getTime()) / 86_400_000));
    const mocksLeft = Math.max(0, Math.ceil(daysToCat / 7));

    const reps = reports ?? [];
    const mocksTaken = reps.filter((r) => r.mock_taken).length;
    const studyHours = Math.round(reps.reduce((s, r) => s + (Number(r.study_duration) || 0), 0));
    const loggedDays = new Set(reps.filter((r) => (r.report_date as string) >= fourteenAgo).map((r) => r.report_date)).size;

    const cov = coverageRows ?? [];
    const studiedStatuses = new Set(['practicing', 'revising', 'exam_ready']);
    const topicsStudied = cov.filter((c) => studiedStatuses.has(c.status as string)).length;
    const revisionDue = cov.filter((c) =>
      ['learning', 'practicing', 'revising'].includes(c.status as string) && (c.updated_at as string) < weekAgoIso
    ).length;

    // Next 4 weekly mock dates (upcoming Sundays).
    const nextMocks: { n: number; label: string }[] = [];
    const d = new Date(nowD);
    d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7)); // next Sunday
    for (let i = 0; i < 4 && mocksLeft > i; i++) {
      nextMocks.push({ n: i + 1, label: d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) });
      d.setDate(d.getDate() + 7);
    }

    const data: BuddyPitchData = {
      firstName: profile?.full_name?.split(' ')[0] ?? 'there',
      daysToCat, mocksLeft, mocksTaken, nextMocks,
      topicsStudied, totalTopics: Object.keys(TOPIC_METADATA).length,
      studyHours, revisionDue,
      streak: (streakRow?.current_streak as number | null) ?? 0,
      loggedDays,
      weakestSection: (xp?.self_reported_weakest_section as string | null) ?? 'DILR',
    };
    return <BuddyPitch data={data} recommendedBuddies={recommendedBuddies} fullName={profile?.full_name ?? undefined} />;
  }

  const buddyId = profile?.buddy_id ?? null;
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 86_400_000).toISOString();

  const [{ data: buddy }, { data: upcoming }, { data: recentCompleted }, { data: pendingRequests }, { data: feedbackRows }, chatUnread, messages] = await Promise.all([
    buddyId
      ? admin.from('profiles').select('full_name, college, cat_percentile, buddy_bio, avatar_url').eq('id', buddyId).single()
      : Promise.resolve({ data: null }),
    // Upcoming: scheduled sessions + 1h grace window
    admin
      .from('video_sessions')
      .select('id, title, scheduled_at, google_meet_link, session_status, session_type')
      .eq('student_id', user.id)
      .eq('session_status', 'scheduled')
      .gte('scheduled_at', new Date(now - 3_600_000).toISOString())
      .order('scheduled_at', { ascending: true })
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
            voice_note_url,
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
  ]);

  const buddyName = buddy?.full_name?.split(' ')[0] ?? 'your buddy';
  const buddyInitials = buddy
    ? (buddy.full_name ?? '').split(' ').map((n: string) => n[0]).filter(Boolean).join('').slice(0, 2).toUpperCase() || '?'
    : '';
  const hasPendingRequest = (pendingRequests?.length ?? 0) > 0;
  const sessions = [...(upcoming ?? []), ...(recentCompleted ?? [])];

  // Pre-sign voice note URLs so VoiceNotePlayer renders immediately with no client-side round-trips.
  const voiceRows = (feedbackRows ?? []).filter((r) => r.voice_note_url);
  const signedUrlMap: Record<string, string> = {};
  if (voiceRows.length > 0) {
    const toPath = (urlOrPath: string) => {
      const marker = '/object/public/voice-notes/';
      const idx = urlOrPath.indexOf(marker);
      return idx >= 0 ? urlOrPath.slice(idx + marker.length) : urlOrPath;
    };
    const paths = voiceRows.map((r) => toPath(r.voice_note_url!));
    const { data: signed } = await admin.storage.from('voice-notes').createSignedUrls(paths, 3600);
    if (signed) {
      signed.forEach((s, i) => { if (s.signedUrl) signedUrlMap[voiceRows[i].id] = s.signedUrl; });
    }
  }

  const nextSession = (upcoming ?? [])[0] ?? null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white p-4 sm:p-6">
      <div className="max-w-md mx-auto pb-24">
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
              signedUrlMap={signedUrlMap}
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
