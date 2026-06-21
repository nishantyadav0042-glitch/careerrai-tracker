import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthUser } from '@/lib/auth';
import { GoalEditor } from './goal-editor';

export const metadata = {
  title: 'Your Goal · CareerRai',
  description: 'What are you working toward?',
};

export default async function GoalPage() {
  const t0 = performance.now();
  const user = await getAuthUser();
  const tAuth = performance.now();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  // Single profile read (was two sequential client-side reads + a getUser hop)
  const { data: profile } = await admin
    .from('profiles')
    .select('cat_percentile, study_target_hours, target_percentile')
    .eq('id', user.id)
    .maybeSingle();
  const tDb = performance.now();

  // TEMP perf instrumentation — surfaces the real execution region + phase
  // timings in Vercel runtime logs so we can measure each lever. Remove later.
  console.log(JSON.stringify({
    tag: 'perf:goal',
    region: process.env.VERCEL_REGION ?? 'local',
    auth_ms: Math.round(tAuth - t0),
    db_ms: Math.round(tDb - tAuth),
    total_ms: Math.round(tDb - t0),
  }));

  return (
    <GoalEditor
      userId={user.id}
      currentCRS={profile?.cat_percentile != null ? Number(profile.cat_percentile) : null}
      initialTarget={profile?.target_percentile != null ? Number(profile.target_percentile) : 90}
      initialStudyHours={profile?.study_target_hours != null ? Number(profile.study_target_hours) : 2}
    />
  );
}
