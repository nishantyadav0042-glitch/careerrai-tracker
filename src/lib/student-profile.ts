import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';

// Per-request memoized profile read shared by the student layout and the tracker
// (home) page. Both previously issued their own profiles query — different
// column lists, same row — on every home load, so React couldn't dedupe them:
// two round-trips for one row. cache() collapses them to a single query within a
// request; the SELECT is the union of the columns both consumers use. Identical
// data, one round-trip. Returns the row, or null on a transient read failure —
// callers already treat a null profile as "degrade, don't crash".
export const getStudentProfile = cache(async (userId: string) => {
  const admin = createAdminClient();
  const { data } = await admin
    .from('profiles')
    .select(
      'role, is_premium, onboarding_completed, notif_prefs, post_signup_done, syllabus_target_date, study_target_hours, is_repeater, is_working_professional, full_name, buddy_id, password_set, created_at, attempt_year, app_installed, push_died_at, push_subscription, qa_model_enabled, dilr_model_enabled, varc_model_enabled, coaching_enrolled, plan_source, coverage_reviewed_at'
    )
    .eq('id', userId)
    .single();
  return data;
});
