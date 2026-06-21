import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { SetupFormClient } from './setup-form-client';

export const metadata = {
  title: 'Setup your profile · CareerRai',
};

export default async function BuddySetupPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('role, full_name, cat_percentile, college, buddy_onboarding_completed')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'buddy') redirect('/login');

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white">
      <div className="max-w-md mx-auto px-4 py-8 pb-16">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">CareerRai</p>
          <h1 className="text-3xl font-bold text-stone-900 mt-1" style={{ fontFamily: 'Georgia, serif' }}>
            Build your profile
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            Students read this before accepting a buddy. Make it count.
          </p>
        </div>
        <SetupFormClient
          buddyId={user.id}
          initialProfile={{
            full_name: profile?.full_name ?? null,
            cat_percentile: profile?.cat_percentile ?? null,
            college: profile?.college ?? null,
          }}
        />
      </div>
    </div>
  );
}
