import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isCalendarConnected } from '@/lib/google-calendar';
import { BuddyTriageView } from './buddy-triage-view';
import { StudentVoiceNotesSection } from './student-voice-notes-section';
import { BuddyAudioResponsesCompact } from '@/components/buddy-audio-responses-compact';
import { BuddyQuickVoiceMessage } from '@/components/buddy-quick-voice-message';
import { MeetingWidget } from '@/components/meeting-widget';
import { GoogleCalendarConnect } from '@/components/google-calendar-connect';
import { UrgentRequestsPanel } from './urgent-requests-panel';
import { Settings, LogOut, Plus } from 'lucide-react';
import Link from 'next/link';

export default async function BuddyHomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, intro_audio_url')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'buddy') redirect('/');
  if (!profile?.intro_audio_url) redirect('/buddy/setup');

  const admin = createAdminClient();
  const [{ data: students }, calendarConnected, { data: pendingRequests }] = await Promise.all([
    admin
      .from('profiles')
      .select('id, full_name')
      .eq('buddy_id', user.id)
      .order('full_name'),
    isCalendarConnected(user.id),
    admin
      .from('session_requests')
      .select('id, student_id, message, created_at, profiles!session_requests_student_id_fkey(full_name)')
      .eq('buddy_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
  ]);

  const firstName = profile?.full_name?.split(' ')[0] ?? 'Buddy';

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <div className="bg-white border-b border-stone-200 sticky top-0 z-40">
        <div className="w-full px-4 py-3 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-xs text-stone-500 font-medium">Welcome back</p>
            <h1 className="text-lg font-bold text-stone-900 truncate" style={{ fontFamily: 'Georgia, serif' }}>
              {firstName}
            </h1>
          </div>

          <div className="flex items-center gap-1.5 ml-2 shrink-0">
            <Link
              href="/buddy/schedule"
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-teal-700 text-white hover:bg-teal-800 rounded-lg transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Schedule</span>
            </Link>
            <Link
              href="/buddy/settings"
              className="p-2 text-stone-600 hover:bg-stone-100 rounded-lg transition-colors"
            >
              <Settings className="w-4 h-4" />
            </Link>
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="p-2 text-stone-600 hover:bg-stone-100 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="w-full px-3 sm:px-4 py-4 space-y-4 max-w-2xl mx-auto">
        {/* Next session widget */}
        <MeetingWidget
          role="buddy"
          students={students ?? []}
          calendarConnected={calendarConnected}
        />

        {/* Calendar connect CTA */}
        {!calendarConnected && (
          <GoogleCalendarConnect connected={false} redirectPath="/buddy/home" />
        )}

        {/* 🚨 URGENT: Session requests from students */}
        {(pendingRequests?.length ?? 0) > 0 && (
          <UrgentRequestsPanel
            requests={(pendingRequests ?? []).map((r) => ({
              id: r.id,
              studentId: r.student_id,
              studentName: (r.profiles as { full_name?: string } | null)?.full_name ?? 'Student',
              message: r.message,
              createdAt: r.created_at,
            }))}
          />
        )}

        {/* Student voice responses */}
        <section>
          <p className="text-[10px] uppercase tracking-widest font-bold text-stone-500 mb-2 px-1">Voice responses from students</p>
          <div className="bg-white rounded-xl border border-stone-200 p-4">
            <BuddyAudioResponsesCompact buddyId={user.id} />
          </div>
        </section>

        {/* Send voice message */}
        <section>
          <p className="text-[10px] uppercase tracking-widest font-bold text-stone-500 mb-2 px-1">Quick voice message</p>
          <div className="bg-white rounded-xl border border-stone-200 p-4">
            <BuddyQuickVoiceMessage buddyId={user.id} buddyName={profile?.full_name || 'Buddy'} />
          </div>
        </section>

        {/* Student voice notes inbox */}
        <section>
          <p className="text-[10px] uppercase tracking-widest font-bold text-stone-500 mb-2 px-1">Student voice notes</p>
          <div className="bg-white rounded-xl border border-stone-200 p-4">
            <StudentVoiceNotesSection buddyId={user.id} />
          </div>
        </section>

        {/* Student triage */}
        <section>
          <p className="text-[10px] uppercase tracking-widest font-bold text-stone-500 mb-2 px-1">Student overview</p>
          <BuddyTriageView buddyId={user.id} />
        </section>

        <p className="text-center text-xs text-stone-400 pb-20">
          Focus on high urgency students first — they need you most.
        </p>
      </div>
    </div>
  );
}
