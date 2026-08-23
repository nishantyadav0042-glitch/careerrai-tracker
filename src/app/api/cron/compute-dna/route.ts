import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { withCronTracking } from '@/lib/cron-run-tracker';
import { computeStudentDna, type DnaProfileInput, type StudentDna } from '@/lib/student-dna';
import { computeNextBestAction, detectMilestones, type PrevDna, type ActionPerformance, type Action } from '@/lib/product-brain';

export const maxDuration = 300;

const METRICS = ['activation', 'consistency', 'momentum', 'purchase_intent', 'churn_risk'] as const;

// Manual-approval gate (founder, 24 Jul): "recommend first, build a track
// record, automate later." Push/in_app candidates are NEVER auto-sent — they
// queue as pending_approval with the exact copy that WOULD go out, and only
// actually send once a human taps Approve in /admin/brain (see
// /api/admin/dna/pending). 'human' actions (winback/reactivation) were always
// founder/buddy-only. 'suppress' (hold) sends nothing by definition.
function copyForAction(action: Action, firstName: string, dna: StudentDna): { title: string; body: string; url: string } | null {
  const s = (dna.signals ?? {}) as Record<string, number>;
  switch (action.id) {
    case 'convert_now':
      return { title: `${firstName}, your buddy is ready when you are`, body: 'You\'ve been checking it out — want to lock it in today?', url: '/student/buddy' };
    case 'activate_first_value':
      return { title: `${firstName}, one thing left to set up`, body: dna.explanations.activation.summary, url: '/student/tracker' };
    case 'celebrate':
      return { title: `${s.currentStreak >= 3 ? `${s.currentStreak}-day streak 🔥` : 'You\'re on a roll'}`, body: 'Keep this going — tomorrow\'s plan is already building on it.', url: '/student/tracker' };
    default:
      return null; // 'winback_human', 'reengage_dormant' (human), 'hold' (suppress)
  }
}

// Recompute every student's DNA + Next-Best-Action, and:
//  • emit semantic milestone events on state transitions (with a real
//    "what brought them back" attribution on recovery)
//  • record a change-history row (with drivers) for every metric that moved
//  • when the Brain's recommendation CHANGES and its channel is push/in_app,
//    QUEUE it for manual approval (never auto-send) — the exact copy is
//    computed and stored now so approval later doesn't need stale DNA
//  • blend in the EMPIRICAL track record (reconcile-decisions cron) so a
//    rule's confidence can be pulled down by real outcomes, never invented up
// Deterministic loop is fine at this scale (a few hundred students); at 100k+
// this moves to a batched / warehouse job — the table shapes don't change.
export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return withCronTracking('/api/cron/compute-dna', async () => {
    const admin = createAdminClient();
    const isoNDaysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

    const [{ data: students }, { data: prevRows }, { data: recentDecisions }, { data: resolvedDecisions }] = await Promise.all([
      admin.from('profiles')
        .select('id, full_name, created_at, onboarding_completed, app_installed, notif_prefs, is_premium, last_seen_at')
        .eq('role', 'student').not('is_test_account', 'is', true),
      admin.from('student_dna').select('student_id, activation, consistency, momentum, purchase_intent, churn_risk, journey_stage, signals'),
      // Last logged decision per student, bounded to 14 days so this stays cheap
      // as the audit log grows. Ordered desc so the first hit per student is latest.
      admin.from('decision_log').select('student_id, action_id, created_at').gte('created_at', isoNDaysAgo(14)).order('created_at', { ascending: false }),
      // Every RESOLVED decision ever (small table until real scale) — the raw
      // material for the empirical track record per action.
      admin.from('decision_log').select('action_id, business_impact').not('business_impact', 'is', null),
    ]);
    if (!students?.length) return NextResponse.json({ computed: 0 });

    const prevMap = new Map((prevRows ?? []).map((r) => [r.student_id as string, r]));
    const lastActionMap = new Map<string, string>();
    for (const d of recentDecisions ?? []) {
      if (!lastActionMap.has(d.student_id as string)) lastActionMap.set(d.student_id as string, d.action_id as string);
    }

    // Empirical performance per action_id — computed fresh every run from real
    // reconciled outcomes only. Never fabricated; unresolved decisions don't count.
    const performance: Record<string, ActionPerformance> = {};
    const byAction = new Map<string, { n: number; positive: number }>();
    for (const r of resolvedDecisions ?? []) {
      const key = r.action_id as string;
      const cur = byAction.get(key) ?? { n: 0, positive: 0 };
      cur.n++;
      if (r.business_impact === 'positive') cur.positive++;
      byAction.set(key, cur);
    }
    for (const [key, v] of byAction) performance[key] = { n: v.n, successRate: v.positive / v.n };

    let computed = 0;
    let milestonesEmitted = 0;
    let decisionsLogged = 0;
    let historyRows = 0;
    let queuedForApproval = 0;

    for (const s of students) {
      try {
        const dna: StudentDna = await computeStudentDna(admin, s as DnaProfileInput);
        const nba = computeNextBestAction(dna, performance);
        const prev = (prevMap.get(s.id) as unknown as (PrevDna & Record<(typeof METRICS)[number], number | null>) | undefined) ?? null;
        const milestones = detectMilestones(prev, dna);

        // Attribute a recovery to whatever actually happened right before it —
        // real data (the most recent event before this computation), never guessed.
        if (milestones.some((m) => m.milestone === 'student_recovered_from_churn')) {
          const { data: lastEvents } = await admin
            .from('student_events').select('event, created_at')
            .eq('user_id', s.id).order('created_at', { ascending: false }).limit(5);
          const notable = (lastEvents ?? []).find((e) => ['push_click', 'buddy_cta_click', 'buddy_unlock_open'].includes(e.event as string));
          for (const m of milestones) {
            if (m.milestone === 'student_recovered_from_churn') {
              m.meta.recovered_via = notable ? notable.event : (lastEvents?.length ? 'organic_return' : 'unknown');
            }
          }
        }

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

        // Decision audit — log only when the Brain's recommendation CHANGES. For
        // the two auto-messageable channels, QUEUE the exact copy rather than
        // sending it — a human approves in /admin/brain before it ever reaches
        // a student (see /api/admin/dna/pending/[id]).
        if (nba.top && lastActionMap.get(s.id) !== nba.top.id) {
          const copy = (nba.top.channel === 'push' || nba.top.channel === 'in_app')
            ? copyForAction(nba.top, ((s.full_name as string) ?? 'there').split(' ')[0], dna)
            : null;

          await admin.from('decision_log').insert({
            student_id: s.id, action_id: nba.top.id, label: nba.top.label, channel: nba.top.channel,
            impact: nba.top.impact, why: nba.top.why, ranked: nba.ranked,
            send_status: copy ? 'pending_approval' : 'n_a',
            pending_notification: copy,
          });
          if (copy) queuedForApproval++;
          lastActionMap.set(s.id, nba.top.id);
          decisionsLogged++;
        }

        computed++;
      } catch (err) {
        console.error('[compute-dna] failed for', s.id, err);
      }
    }

    return NextResponse.json({ computed, milestonesEmitted, decisionsLogged, historyRows, queuedForApproval });
  });
}

export { POST as GET };
