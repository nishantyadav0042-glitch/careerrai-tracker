import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { computeStudentDna, type DnaProfileInput } from '@/lib/student-dna';
import { computeNextBestAction, detectMilestones, type PrevDna } from '@/lib/product-brain';

export const maxDuration = 300;

// Recompute every student's DNA + Next-Best-Action, and emit semantic milestone
// events on state transitions. Deterministic loop is fine at this scale (a few
// hundred students); at 100k+ this moves to a batched / warehouse job — but
// nothing downstream (the student_dna / student_milestones shapes) changes.
export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = createAdminClient();

  const [{ data: students }, { data: prevRows }] = await Promise.all([
    admin.from('profiles')
      .select('id, created_at, onboarding_completed, app_installed, notif_prefs, is_premium, last_seen_at')
      .eq('role', 'student').not('is_test_account', 'is', true),
    // Prior DNA, so we can detect transitions (became_at_risk, recovered, …).
    admin.from('student_dna').select('student_id, churn_risk, purchase_intent, consistency, journey_stage, signals'),
  ]);
  if (!students?.length) return NextResponse.json({ computed: 0 });

  const prevMap = new Map((prevRows ?? []).map((r) => [r.student_id as string, r]));

  let computed = 0;
  let milestonesEmitted = 0;
  for (const s of students) {
    try {
      const dna = await computeStudentDna(admin, s as DnaProfileInput);
      const nba = computeNextBestAction(dna);
      const prev = (prevMap.get(s.id) as unknown as PrevDna | undefined) ?? null;
      const milestones = detectMilestones(prev, dna);

      await admin.from('student_dna').upsert({
        student_id: s.id,
        activation: dna.activation,
        consistency: dna.consistency,
        momentum: dna.momentum,
        purchase_intent: dna.purchase_intent,
        churn_risk: dna.churn_risk,
        journey_stage: dna.journey_stage,
        signals: dna.signals,
        next_best_action: nba,
        computed_at: new Date().toISOString(),
      }, { onConflict: 'student_id' });

      if (milestones.length > 0) {
        await admin.from('student_milestones').insert(
          milestones.map((m) => ({ student_id: s.id, milestone: m.milestone, meta: m.meta }))
        );
        milestonesEmitted += milestones.length;
      }
      computed++;
    } catch (err) {
      console.error('[compute-dna] failed for', s.id, err);
    }
  }

  return NextResponse.json({ computed, milestonesEmitted });
}

export { POST as GET };
