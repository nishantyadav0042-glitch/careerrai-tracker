import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isRequestAdmin } from '@/lib/require-admin';

// Answer-first read over Student DNA — returns ACTION segments, not charts. The
// point isn't "here's a table", it's "here's who to act on today and why".
export async function GET() {
  if (!(await isRequestAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = createAdminClient();

  const { data: rows } = await admin
    .from('student_dna')
    .select('student_id, activation, consistency, momentum, purchase_intent, churn_risk, journey_stage, signals, computed_at, profiles!inner(full_name, phone, is_premium)');

  type Prof = { full_name: string | null; phone: string | null; is_premium: boolean | null };
  const dna = (rows ?? []) as unknown as Array<{
    student_id: string; activation: number; consistency: number; momentum: number;
    purchase_intent: number | null; churn_risk: number; journey_stage: string; signals: unknown;
    profiles: Prof | Prof[] | null;
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
    };
  });

  const byStage: Record<string, number> = {};
  for (const r of named) byStage[String(r.stage)] = (byStage[String(r.stage)] ?? 0) + 1;

  return NextResponse.json({
    total: named.length,
    byStage,
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
