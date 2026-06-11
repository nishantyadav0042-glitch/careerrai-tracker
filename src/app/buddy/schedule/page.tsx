import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isCalendarConnected } from '@/lib/google-calendar';
import { MeetingWidget } from '@/components/meeting-widget';
import { GoogleCalendarConnect } from '@/components/google-calendar-connect';

export default async function BuddySchedulePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'buddy') redirect('/');

  const [{ data: students }, connected, { data: tokens }] = await Promise.all([
    admin
      .from('profiles')
      .select('id, full_name')
      .eq('buddy_id', user.id)
      .order('full_name'),
    isCalendarConnected(user.id),
    admin
      .from('google_oauth_tokens')
      .select('google_email')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="bg-white border-b border-stone-200">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link
            href="/buddy/home"
            className="p-2 hover:bg-stone-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-stone-600" />
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-stone-900">Sessions</h1>
            <p className="text-sm text-stone-600">Schedule GMeet sessions with your students</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <GoogleCalendarConnect
          connected={connected}
          googleEmail={tokens?.google_email}
          redirectPath="/buddy/schedule"
        />
        <MeetingWidget
          role="buddy"
          students={students ?? []}
          calendarConnected={connected}
        />
      </div>
    </div>
  );
}
