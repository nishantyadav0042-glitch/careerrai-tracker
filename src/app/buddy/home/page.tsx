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
import { Settings, LogOut, Plus } from 'lucide-react';
import Link from 'next/link';

export default async function BuddyHomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Check if user is a buddy
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, intro_audio_url')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'buddy') {
    redirect('/');
  }

  // Check if setup complete
  if (!profile?.intro_audio_url) {
    redirect('/buddy/setup');
  }

  // Meeting widget data — parallel, single round trip
  const admin = createAdminClient();
  const [{ data: students }, calendarConnected] = await Promise.all([
    admin
      .from('profiles')
      .select('id, full_name')
      .eq('buddy_id', user.id)
      .order('full_name'),
    isCalendarConnected(user.id),
  ]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 to-stone-100">
      {/* Header - Mobile Optimized */}
      <div className="bg-white border-b border-stone-200 sticky top-0 z-40">
        <div className="w-full px-4 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <h1
              className="text-xl sm:text-2xl font-bold text-stone-900 truncate"
              style={{ fontFamily: 'Georgia, serif' }}
            >
              Student Triage
            </h1>
            <p className="text-xs sm:text-sm text-stone-600 mt-0.5 sm:mt-1 truncate">
              Welcome, {profile?.full_name?.split(' ')[0]}
            </p>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3 ml-2 flex-shrink-0">
            <Link
              href="/buddy/schedule"
              className="inline-flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-1.5 sm:py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors text-xs sm:text-sm font-medium"
            >
              <Plus className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
              <span className="hidden sm:inline">Schedule</span>
            </Link>

            <Link
              href="/buddy/settings"
              className="inline-flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-1.5 sm:py-2 text-stone-700 hover:bg-stone-100 rounded-lg transition-colors text-xs sm:text-sm"
            >
              <Settings className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
              <span className="hidden sm:inline font-medium">Settings</span>
            </Link>

            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="inline-flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-1.5 sm:py-2 text-stone-700 hover:bg-stone-100 rounded-lg transition-colors text-xs sm:text-sm"
              >
                <LogOut className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
                <span className="hidden sm:inline font-medium">Logout</span>
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Main Content - Mobile Optimized */}
      <div className="w-full px-3 sm:px-4 py-4 sm:py-8">
        <div className="space-y-3 sm:space-y-5">
          {/* 0. MEETING WIDGET — top of page, above everything */}
          <MeetingWidget
            role="buddy"
            students={students ?? []}
            calendarConnected={calendarConnected}
          />

          {/* 0.5 Google Calendar connect CTA when disconnected */}
          {!calendarConnected && (
            <GoogleCalendarConnect
              connected={false}
              redirectPath="/buddy/home"
            />
          )}

          {/* 1. COMPACT Audio Responses - TOP PRIORITY */}
          <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-3 sm:p-5 border-2 border-blue-200">
            <BuddyAudioResponsesCompact buddyId={user.id} />
          </div>

          {/* 2. Quick Voice Message - SEND FEEDBACK */}
          <div className="bg-white rounded-xl p-3 sm:p-5 border border-orange-200">
            <BuddyQuickVoiceMessage buddyId={user.id} buddyName={profile?.full_name || 'Buddy'} />
          </div>

          {/* 3. Student Voice Notes - Priority Action */}
          <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl p-3 sm:p-5 border-2 border-orange-200">
            <StudentVoiceNotesSection buddyId={user.id} />
          </div>

          {/* 5. Triage View */}
          <div className="mt-6 sm:mt-8">
            <BuddyTriageView buddyId={user.id} />
          </div>

          {/* Footer */}
          <div className="mt-6 sm:mt-12 text-center text-xs sm:text-sm text-stone-600">
            <p>
              💡 Focus on students with high urgency scores first. They need your
              guidance the most.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
