import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { computeStudentDna, type DnaProfileInput } from '@/lib/student-dna';

export const maxDuration = 300;

// Recompute every student's behavioural fingerprint. Deterministic loop is fine
// at this scale (a few hundred students); at 100k+ this moves to a batched /
// warehouse job — but nothing downstream (the student_dna table shape) changes.
export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = createAdminClient();

  const { data: students } = await admin
    .from('profiles')
    .select('id, created_at, onboarding_completed, app_installed, notif_prefs, is_premium, last_seen_at')
    .eq('role', 'student')
    .not('is_test_account', 'is', true);
  if (!students?.length) return NextResponse.json({ computed: 0 });

  let computed = 0;
  for (const s of students) {
    try {
      const dna = await computeStudentDna(admin, s as DnaProfileInput);
      await admin.from('student_dna').upsert({
        student_id: s.id,
        activation: dna.activation,
        consistency: dna.consistency,
        momentum: dna.momentum,
        purchase_intent: dna.purchase_intent,
        churn_risk: dna.churn_risk,
        journey_stage: dna.journey_stage,
        signals: dna.signals,
        computed_at: new Date().toISOString(),
      }, { onConflict: 'student_id' });
      computed++;
    } catch (err) {
      console.error('[compute-dna] failed for', s.id, err);
    }
  }

  return NextResponse.json({ computed });
}

export { POST as GET };
