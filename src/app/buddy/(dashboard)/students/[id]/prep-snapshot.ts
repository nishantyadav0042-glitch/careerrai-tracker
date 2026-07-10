import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import { computePrepMemory } from '@/lib/prep-memory-data';

// One request-scoped snapshot shared by StudyPlanFeed and PreparationDNA.
// Both cards used to independently fetch the student's profile AND run
// computePrepMemory (4 DB round-trips each) for the SAME student in the
// SAME render — React's cache() dedupes that to a single run per request.
// Behaviour is identical; only the duplicate round-trips are gone.
export const getStudentPrepSnapshot = cache(async (studentId: string) => {
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from('profiles')
    .select('attempt_year, is_repeater, is_working_professional, current_stage, self_reported_weakest_section, self_reported_weak_topic, created_at')
    .eq('id', studentId)
    .single();
  if (!profile) return null;

  const memory = await computePrepMemory(
    admin, studentId,
    { isRepeater: !!profile.is_repeater, isWorkingProfessional: !!profile.is_working_professional },
    (profile.created_at as string | null)?.split('T')[0] ?? null
  );

  return { profile, ...memory };
});
