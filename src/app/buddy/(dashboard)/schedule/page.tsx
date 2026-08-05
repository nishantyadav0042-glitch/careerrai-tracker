import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { MeetingWidget } from '@/components/meeting-widget';
import { GoogleConnectCard } from '@/components/google-connect-card';
import { googleConnection } from '@/lib/google-oauth';

export default async function BuddySchedulePage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const googleStatus = typeof params.google === 'string' ? params.google : null;
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

  const [{ data: students }, google] = await Promise.all([
    admin.from('profiles').select('id, full_name').eq('buddy_id', user.id).order('full_name'),
    // A Meet link is minted on the mentor's own calendar, so scheduling is
    // gated on this — surfaced here rather than failing at the booking.
    googleConnection(user.id),
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
            <p className="text-sm text-stone-600">Schedule video sessions with your students</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <GoogleConnectCard
          connected={google.connected}
          email={google.email}
          from="/buddy/schedule"
          status={googleStatus}
        />
        {/* Booking is only offered once Google is connected — the link is
            minted on the mentor's calendar, so an unconnected mentor would
            hit a 428 at submit. Better to say so before they fill the form. */}
        {google.connected ? (
          <MeetingWidget role="buddy" students={students ?? []} />
        ) : (
          <div className="rounded-2xl border border-stone-200 bg-white p-4 text-center">
            <p className="text-sm text-stone-500">Connect Google above to start scheduling sessions.</p>
          </div>
        )}
      </div>
    </div>
  );
}
