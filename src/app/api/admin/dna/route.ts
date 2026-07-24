import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isRequestAdmin } from '@/lib/require-admin';

// Answer-first read over Student DNA — returns ACTION segments, not charts. The
// point isn't "here's a table", it's "here's who to act on today and why".
export async function GET() {
  if (!(await isRequestAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = createAdminClient();

  const isoNDaysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
  const [{ data: rows }, { data: recentHistory }, { data: resolved }] = await Promise.all([
    admin.from('student_dna')
      .select('student_id, activation, consistency, momentum, purchase_intent, churn_risk, journey_stage, signals, next_best_action, computed_at, profiles!inner(full_name, phone, is_premium)'),
    // Cohort explainability: "why did churn move this week?" — aggregate the
    // drivers behind every recent metric CHANGE across the whole population,
    // not just one student. Same primitive (student_dna_history), zoomed out.
    admin.from('student_dna_history').select('metric, prev_value, new_value, drivers').gte('created_at', isoNDaysAgo(7)),
    // Closed-loop track record: every RESOLVED Brain decision, ever — "last N
    // times we recommended X, how many actually worked?"
    admin.from('decision_log').select('action_id, outcome, business_impact').not('outcome', 'is', null),
  ]);

  type Prof = { full_name: string | null; phone: string | null; is_premium: boolean | null };
  type Nba = { top?: { id: string; label: string; channel: string; impact: number; why: string }; ranked?: unknown };
  const dna = (rows ?? []) as unknown as Array<{
    student_id: string; activation: number; consistency: number; momentum: number;
    purchase_intent: number | null; churn_risk: number; journey_stage: string; signals: unknown;
    next_best_action: Nba | null; profiles: Prof | Prof[] | null;
  }>;
  const named = dna.map((r) => {
    const prof = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    return {
      student_id: r.student_id,
      name: prof?.full_name ?? null,
      phone: prof?.phone ?? null,
      activation: r.activation, consistency: r.consistency, momentum: r.momentum,
      purchase_intent: r.purchase_intent, churn_risk: r.churn_risk,
      stage: r.journey_stage, signals: r.signals,
      nextAction: r.next_best_action?.top ?? null,
    };
  });

  const byStage: Record<string, number> = {};
  for (const r of named) byStage[String(r.stage)] = (byStage[String(r.stage)] ?? 0) + 1;

  // What is the Brain telling us to do, in aggregate, right now.
  const byAction: Record<string, number> = {};
  for (const r of named) byAction[r.nextAction?.id ?? 'none'] = (byAction[r.nextAction?.id ?? 'none'] ?? 0) + 1;

  // COHORT EXPLAINABILITY: "why did churn move this week?" — for each metric,
  // separate the population's recent moves into net-up vs net-down, then rank
  // the drivers that showed up most often behind those moves. Same primitive
  // as one student's explanation, aggregated across everyone.
  type HistRow = { metric: string; prev_value: number | null; new_value: number | null; drivers: { label: string; weight: number }[] };
  const hist = (recentHistory ?? []) as HistRow[];
  const cohortExplain: Record<string, unknown> = {};
  for (const metric of ['activation', 'consistency', 'momentum', 'purchase_intent', 'churn_risk']) {
    const moves = hist.filter((h) => h.metric === metric && h.prev_value != null && h.new_value != null);
    if (moves.length === 0) continue;
    const netDelta = moves.reduce((s, m) => s + ((m.new_value as number) - (m.prev_value as number)), 0);
    const driverCounts = new Map<string, number>();
    for (const m of moves) for (const d of m.drivers ?? []) driverCounts.set(d.label, (driverCounts.get(d.label) ?? 0) + 1);
    const topDrivers = [...driverCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, count]) => ({ label, count }));
    cohortExplain[metric] = {
      direction: netDelta > 0 ? 'up' : netDelta < 0 ? 'down' : 'flat',
      studentsAffected: moves.length,
      confidence: moves.length >= 20 ? 'high' : moves.length >= 5 ? 'medium' : 'low',
      topDrivers,
    };
  }

  // ACTION PERFORMANCE (closed-loop): "last N times we recommended X, how many
  // actually worked?" — computed ONLY from resolved outcomes (reconcile-
  // decisions cron). This is what lets the Brain's confidence change over time.
  const perfCounts = new Map<string, { n: number; positive: number; outcomes: Record<string, number> }>();
  for (const r of resolved ?? []) {
    const key = r.action_id as string;
    const cur = perfCounts.get(key) ?? { n: 0, positive: 0, outcomes: {} };
    cur.n++;
    if (r.business_impact === 'positive') cur.positive++;
    const o = (r.outcome as string) ?? 'unknown';
    cur.outcomes[o] = (cur.outcomes[o] ?? 0) + 1;
    perfCounts.set(key, cur);
  }
  const actionPerformance: Record<string, unknown> = {};
  for (const [key, v] of perfCounts) {
    actionPerformance[key] = { n: v.n, successRate: Math.round((v.positive / v.n) * 100), outcomes: v.outcomes };
  }

  return NextResponse.json({
    total: named.length,
    byStage,
    byAction,
    actionPerformance, // the Brain's real track record, per action, from resolved outcomes only
    cohortExplain, // "why did X move this week", across the whole population
    window: 'last 7 days',
    // THE ACTION QUEUE: every student ranked by the impact of their single
    // highest-value next action — work this list top-down.
    actionQueue: named
      .filter((r) => r.nextAction && r.nextAction.channel !== 'suppress')
      .sort((a, b) => (b.nextAction?.impact ?? 0) - (a.nextAction?.impact ?? 0))
      .slice(0, 30),
    // ACT NOW: high intent, not yet premium → the founder should push these to a buddy today.
    hotLeads: named.filter((r) => r.purchase_intent != null && (r.purchase_intent as number) >= 40)
      .sort((a, b) => (b.purchase_intent as number) - (a.purchase_intent as number)).slice(0, 25),
    // WIN BACK: high churn risk but were once active (not brand-new no-shows).
    churning: named.filter((r) => (r.churn_risk as number) >= 70 && (r.consistency as number) > 0)
      .sort((a, b) => (b.churn_risk as number) - (a.churn_risk as number)).slice(0, 25),
    // HABIT FORMING: your success stories — study what they did.
    habitual: named.filter((r) => r.stage === 'habitual' || r.stage === 'premium')
      .sort((a, b) => (b.consistency as number) - (a.consistency as number)).slice(0, 25),
    // NEVER ACTIVATED: signed up, never got value — biggest activation leak.
    stalled: named.filter((r) => (r.activation as number) < 75 && r.stage !== 'dormant').slice(0, 25),
  });
}
