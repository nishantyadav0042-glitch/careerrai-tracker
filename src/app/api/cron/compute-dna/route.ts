import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { computeStudentDna, type DnaProfileInput, type StudentDna } from '@/lib/student-dna';
import { computeNextBestAction, detectMilestones, type PrevDna } from '@/lib/product-brain';

export const maxDuration = 300;

const METRICS = ['activation', 'consistency', 'momentum', 'purchase_intent', 'churn_risk'] as const;

// Recompute every student's DNA + Next-Best-Action, and:
//  • emit semantic milestone events on state transitions
//  • record a change-history row (with drivers) for every metric that moved
//  • log a decision-audit row whenever the Brain's top action for a student
//    CHANGES (deduped against the last 14 days — never one row per tick, or
//    the audit log would be unreadable within a week)
// Deterministic loop is fine at this scale (a few hundred students); at 100k+
// this moves to a batched / warehouse job — the table shapes don't change.
export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = createAdminClient();
  const isoNDaysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

  const [{ data: students }, { data: prevRows }, { data: recentDecisions }] = await Promise.all([
    admin.from('profiles')
      .select('id, created_at, onboarding_completed, app_installed, notif_prefs, is_premium, last_seen_at')
      .eq('role', 'student').not('is_test_account', 'is', true),
    admin.from('student_dna').select('student_id, activation, consistency, momentum, purchase_intent, churn_risk, journey_stage, signals'),
    // Last logged decision per student, bounded to 14 days so this stays cheap
    // as the audit log grows. Ordered desc so the first hit per student is latest.
    admin.from('decision_log').select('student_id, action_id, created_at').gte('created_at', isoNDaysAgo(14)).order('created_at', { ascending: false }),
  ]);
  if (!students?.length) return NextResponse.json({ computed: 0 });

  const prevMap = new Map((prevRows ?? []).map((r) => [r.student_id as string, r]));
  const lastActionMap = new Map<string, string>();
  for (const d of recentDecisions ?? []) {
    if (!lastActionMap.has(d.student_id as string)) lastActionMap.set(d.student_id as string, d.action_id as string);
  }

  let computed = 0;
  let milestonesEmitted = 0;
  let decisionsLogged = 0;
  let historyRows = 0;

  for (const s of students) {
    try {
      const dna: StudentDna = await computeStudentDna(admin, s as DnaProfileInput);
      const nba = computeNextBestAction(dna);
      const prev = (prevMap.get(s.id) as unknown as (PrevDna & Record<(typeof METRICS)[number], number | null>) | undefined) ?? null;
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
        explanations: dna.explanations,
        next_best_action: nba,
        computed_at: new Date().toISOString(),
      }, { onConflict: 'student_id' });

      // Change history — one row per metric that actually moved, carrying the
      // top factors from that metric's own explanation as the "why" of the delta.
      if (prev) {
        const historyInserts: Record<string, unknown>[] = [];
        for (const m of METRICS) {
          const prevVal = prev[m] as number | null;
          const newVal = dna[m] as number | null;
          if (prevVal === newVal || newVal == null) continue;
          const expl = dna.explanations[m];
          const drivers = [...expl.positives, ...expl.negatives].sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)).slice(0, 4);
          historyInserts.push({ student_id: s.id, metric: m, prev_value: prevVal, new_value: newVal, drivers });
        }
        if (historyInserts.length > 0) {
          await admin.from('student_dna_history').insert(historyInserts);
          historyRows += historyInserts.length;
        }
      }

      if (milestones.length > 0) {
        await admin.from('student_milestones').insert(
          milestones.map((m) => ({ student_id: s.id, milestone: m.milestone, meta: m.meta }))
        );
        milestonesEmitted += milestones.length;
      }

      // Decision audit — log only when the Brain's recommendation CHANGES.
      if (nba.top && lastActionMap.get(s.id) !== nba.top.id) {
        await admin.from('decision_log').insert({
          student_id: s.id, action_id: nba.top.id, label: nba.top.label, channel: nba.top.channel,
          impact: nba.top.impact, why: nba.top.why, ranked: nba.ranked,
        });
        lastActionMap.set(s.id, nba.top.id);
        decisionsLogged++;
      }

      computed++;
    } catch (err) {
      console.error('[compute-dna] failed for', s.id, err);
    }
  }

  return NextResponse.json({ computed, milestonesEmitted, decisionsLogged, historyRows });
}

export { POST as GET };
