import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { BuddyAudioRecorder } from '@/components/buddy-audio-recorder';
import { CheckCircle2 } from 'lucide-react';

export default async function BuddySetupPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Check if user is a buddy
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, intro_audio_url, buddy_bio')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'buddy') {
    redirect('/');
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 to-stone-100 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <h1
            className="text-4xl font-bold text-stone-900 mb-2"
            style={{ fontFamily: 'Georgia, serif' }}
          >
            Complete Your Profile
          </h1>
          <p className="text-lg text-stone-600">
            Help your students get to know you better
          </p>
        </div>

        {/* Setup Checklist */}
        <div className="mb-12 space-y-3">
          <div className="flex items-center gap-3 p-4 bg-white rounded-lg border border-stone-200">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />
            <div>
              <p className="font-semibold text-stone-900">Account Created</p>
              <p className="text-sm text-stone-600">You're set up as an IIM alumni buddy</p>
            </div>
          </div>

          <div
            className={`flex items-center gap-3 p-4 rounded-lg border ${
              profile?.intro_audio_url
                ? 'bg-emerald-50 border-emerald-200'
                : 'bg-orange-50 border-orange-200'
            }`}
          >
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-white ${
                profile?.intro_audio_url ? 'bg-emerald-600' : 'bg-orange-600'
              }`}
            >
              2
            </div>
            <div>
              <p className="font-semibold text-stone-900">
                {profile?.intro_audio_url ? '✓ Audio Intro Recorded' : 'Record Your Intro'}
              </p>
              <p className="text-sm text-stone-600">
                {profile?.intro_audio_url
                  ? 'Your intro is ready to be heard by students'
                  : 'Help students meet you through a short audio message'}
              </p>
            </div>
          </div>
        </div>

        {/* Audio Recorder */}
        <div className="bg-white rounded-2xl shadow-lg p-8 border border-stone-200">
          {profile?.intro_audio_url ? (
            <div className="text-center py-8">
              <CheckCircle2 className="w-16 h-16 text-emerald-600 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-stone-900 mb-2">
                You're All Set! 🎉
              </h2>
              <p className="text-stone-600 mb-6">
                Your intro audio has been saved. Students will hear this when they
                meet you during onboarding.
              </p>

              <div className="flex gap-3 justify-center">
                <a
                  href="/buddy/students"
                  className="px-6 py-3 bg-orange-600 text-white rounded-lg font-semibold hover:bg-orange-700 transition-all"
                >
                  View Your Students
                </a>
              </div>
            </div>
          ) : (
            <BuddyAudioRecorder
              buddyId={user.id}
              onUploadComplete={() => {
                // Reload page to show completion state
                window.location.reload();
              }}
            />
          )}
        </div>

        {/* Info Box */}
        <div className="mt-12 p-6 bg-blue-50 border border-blue-200 rounded-xl">
          <h3 className="font-semibold text-blue-900 mb-3">
            What Makes a Great Buddy Intro?
          </h3>
          <ul className="space-y-2 text-sm text-blue-800">
            <li>
              ✓ <strong>Be Personal:</strong> Share your name, college, and CAT
              score/percentile
            </li>
            <li>
              ✓ <strong>Tell Your Story:</strong> How did CAT shape your life? What's
              your background?
            </li>
            <li>
              ✓ <strong>Show Your Style:</strong> Students want to know the real you,
              not a script
            </li>
            <li>
              ✓ <strong>Keep It Right Length:</strong> 30-45 seconds is ideal (shows
              confidence, not rushed)
            </li>
            <li>
              ✓ <strong>Set Expectations:</strong> What can students expect from you as
              their buddy?
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
