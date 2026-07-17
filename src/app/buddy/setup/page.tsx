import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { SetupFormClient } from './setup-form-client';

export const metadata = {
  title: 'Set up your profile · CareerRai',
};

export default async function BuddySetupPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('role, full_name, cat_percentile, college, buddy_onboarding_completed, first_attempt_percentile, cat_year, iim_converted, current_company, biggest_mistake, younger_self_advice, strongest_section, student_types_helped, how_i_work, linkedin_url, avatar_url')
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
            first_attempt_percentile: profile?.first_attempt_percentile ?? null,
            cat_year: profile?.cat_year ?? null,
            iim_converted: profile?.iim_converted ?? null,
            current_company: profile?.current_company ?? null,
            biggest_mistake: profile?.biggest_mistake ?? null,
            younger_self_advice: profile?.younger_self_advice ?? null,
            strongest_section: profile?.strongest_section ?? null,
            student_types_helped: profile?.student_types_helped ?? null,
            how_i_work: profile?.how_i_work ?? null,
            linkedin_url: profile?.linkedin_url ?? null,
            avatar_url: profile?.avatar_url ?? null,
          }}
        />
      </div>
    </div>
  );
}
