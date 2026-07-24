import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';

export const maxDuration = 300;

// Closed-loop learning (founder, 24 Jul): "Did our intervention actually
// improve the student's behaviour?" This is the job that answers it — for
// every Brain recommendation whose grace window has passed, it looks at what
// REALLY happened afterward (a real payment row, a real DNA-history move, a
// real notification click) and records outcome + business_impact. Nothing
// here is guessed; an action with no evidence either way is left unresolved
// rather than forced to a verdict. compute-dna's next run then blends these
// real outcomes into every rule's confidence (see product-brain.ts).
const GRACE_HOURS: Record<string, number> = {
  convert_now: 72,
  winback_human: 96,
  reengage_dormant: 96,
  activate_first_value: 48,
  celebrate: 48,
};

const BATCH = 200;

export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = createAdminClient();

  const { data: pending } = await admin
    .from('decision_log')
    .select('id, student_id, action_id, created_at, notification_id')
    .is('outcome', null)
    .order('created_at', { ascending: true })
    .limit(BATCH);
  if (!pending?.length) return NextResponse.json({ resolved: 0, stillPending: 0 });

  let resolved = 0;

  for (const d of pending) {
    const window = GRACE_HOURS[d.action_id as string];
    if (!window) continue; // unknown/hold — nothing to reconcile
    const decidedAt = new Date(d.created_at as string).getTime();
    const elapsedHours = (Date.now() - decidedAt) / 3_600_000;
    const windowOver = elapsedHours >= window;

    let outcome: string | null = null;
    let impact: 'positive' | 'neutral' | null = null;

    if (d.action_id === 'convert_now') {
      const { data: paid } = await admin
        .from('student_payments').select('id')
        .eq('student_id', d.student_id).eq('status', 'paid')
        .gte('paid_at', d.created_at as string)
        .limit(1).maybeSingle();
      if (paid) { outcome = 'purchased'; impact = 'positive'; }
      else if (windowOver) { outcome = 'no_purchase'; impact = 'neutral'; }
    } else if (d.action_id === 'winback_human' || d.action_id === 'reengage_dormant') {
      const { data: moved } = await admin
        .from('student_dna_history').select('prev_value, new_value')
        .eq('student_id', d.student_id).eq('metric', 'churn_risk')
        .gt('created_at', d.created_at as string)
        .order('created_at', { ascending: true }).limit(1).maybeSingle();
      if (moved && (moved.new_value as number) <= (moved.prev_value as number) - 20) { outcome = 'recovered'; impact = 'positive'; }
      else if (windowOver) { outcome = 'no_response'; impact = 'neutral'; }
    } else if (d.action_id === 'activate_first_value') {
      const { data: moved } = await admin
        .from('student_dna_history').select('new_value')
        .eq('student_id', d.student_id).eq('metric', 'activation')
        .gt('created_at', d.created_at as string)
        .order('created_at', { ascending: true }).limit(1).maybeSingle();
      if (moved && (moved.new_value as number) >= 100) { outcome = 'activated'; impact = 'positive'; }
      else if (windowOver) { outcome = 'no_response'; impact = 'neutral'; }
    } else if (d.action_id === 'celebrate') {
      // Reinforcement — success = they were opened/clicked at all, real signal
      // from the actual notification we sent, not a guess.
      if (d.notification_id) {
        const { data: notif } = await admin.from('notifications').select('clicked_at').eq('id', d.notification_id).maybeSingle();
        if (notif?.clicked_at) { outcome = 'opened'; impact = 'positive'; }
        else if (windowOver) { outcome = 'not_opened'; impact = 'neutral'; }
      } else if (windowOver) {
        outcome = 'no_notification'; impact = 'neutral';
      }
    }

    if (outcome) {
      await admin.from('decision_log').update({
        outcome, business_impact: impact, executed: true, outcome_at: new Date().toISOString(),
      }).eq('id', d.id);
      resolved++;
    }
  }

  const { count: stillPending } = await admin.from('decision_log').select('id', { count: 'exact', head: true }).is('outcome', null);
  return NextResponse.json({ resolved, stillPending: stillPending ?? 0 });
}

export { POST as GET };
