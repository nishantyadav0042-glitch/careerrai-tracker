import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { BuddyTriageView } from './buddy-triage-view';
import { StudentVoiceNotesSection } from './student-voice-notes-section';
import { BuddyStudentResponses } from '@/components/buddy-student-responses';
import { BuddyQuickVoiceMessage } from '@/components/buddy-quick-voice-message';
import { BuddyVideoSessionsDashboard } from '@/components/buddy-video-sessions-dashboard';
import { Settings, LogOut } from 'lucide-react';
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 to-stone-100">
      {/* Header */}
      <div className="bg-white border-b border-stone-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1
              className="text-2xl font-bold text-stone-900"
              style={{ fontFamily: 'Georgia, serif' }}
            >
              Student Triage
            </h1>
            <p className="text-sm text-stone-600 mt-1">
              Welcome back, {profile?.full_name?.split(' ')[0]}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/buddy/setup"
              className="inline-flex items-center gap-2 px-4 py-2 text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
            >
              <Settings className="w-4 h-4" />
              <span className="text-sm font-medium">Setup</span>
            </Link>

            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="inline-flex items-center gap-2 px-4 py-2 text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span className="text-sm font-medium">Logout</span>
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Student Voice Responses - ON TOP */}
        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-6 mb-6 border-2 border-blue-200">
          <BuddyStudentResponses buddyId={user.id} />
        </div>

        {/* Quick Voice Message - SEND FEEDBACK */}
        <div className="bg-white rounded-xl p-6 mb-6 border border-orange-200">
          <BuddyQuickVoiceMessage buddyId={user.id} buddyName={profile?.full_name || 'Buddy'} />
        </div>

        {/* Video Sessions */}
        <div className="bg-gradient-to-br from-teal-50 to-cyan-50 rounded-xl p-6 mb-6 border-2 border-teal-200">
          <BuddyVideoSessionsDashboard buddyId={user.id} buddyName={profile?.full_name || 'Buddy'} />
        </div>

        {/* Student Voice Notes - Priority Action */}
        <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl p-6 mb-8 border-2 border-orange-200">
          <StudentVoiceNotesSection buddyId={user.id} />
        </div>

        {/* Introduction */}
        <div className="bg-white rounded-xl p-6 mb-8 border border-stone-200">
          <h2 className="text-lg font-semibold text-stone-900 mb-2">
            Your Buddy Dashboard
          </h2>
          <p className="text-stone-600">
            Monitor your assigned students' progress, identify who needs support, and
            provide personalized guidance to help them succeed on their CAT journey.
          </p>
        </div>

        {/* Triage View */}
        <BuddyTriageView buddyId={user.id} />

        {/* Footer */}
        <div className="mt-12 text-center text-sm text-stone-600">
          <p>
            💡 Focus on students with high urgency scores first. They need your
            guidance the most.
          </p>
        </div>
      </div>
    </div>
  );
}
