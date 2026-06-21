import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthUser } from '@/lib/auth';
import { GoalEditor } from './goal-editor';

export const metadata = {
  title: 'Your Goal · CareerRai',
  description: 'What are you working toward?',
};

export default async function GoalPage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  // Single profile read (was two sequential client-side reads + a getUser hop)
  const { data: profile } = await admin
    .from('profiles')
    .select('cat_percentile, study_target_hours, target_percentile')
    .eq('id', user.id)
    .maybeSingle();

  return (
    <GoalEditor
      userId={user.id}
      currentCRS={profile?.cat_percentile != null ? Number(profile.cat_percentile) : null}
      initialTarget={profile?.target_percentile != null ? Number(profile.target_percentile) : 90}
      initialStudyHours={profile?.study_target_hours != null ? Number(profile.study_target_hours) : 2}
    />
  );
}
