import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadQaState } from '@/lib/qa-state';
import {
  pickActiveTopics, splitTimeBudget, sessionsForBudget, dueRevision, taskCopy,
  swapCandidates, coreProgress, stageLabel, REVISION_SESSION_MINUTES,
  type QaStudentState,
} from '@/lib/qa-mastery-engine';
import { QA_STAGE_ORDER, type QaTopicSpec } from '@/lib/qa-topic-graph';

// GET /api/qa/today — the QA Mastery plan for today. Gated by
// profiles.qa_model_enabled during rollout (E3): off = 404 so the caller
// falls back to the legacy routine.

function slot(state: QaStudentState, spec: QaTopicSpec, minutes: number, why: string) {
  const plan = sessionsForBudget(state, spec, minutes);
  const idx = QA_STAGE_ORDER.indexOf(plan.stage);
  return {
    topic: spec.topic, cluster: spec.cluster, stage: plan.stage, stageLabel: stageLabel(plan.stage),
    stageNumber: idx + 1, stageTotal: QA_STAGE_ORDER.length,
    sessionsToday: plan.sessionsToday, minutes: plan.minutesUsed,
    sessionsRemainingAtStage: plan.sessionsRemainingAtStage,
    target: taskCopy(spec, plan), why,
  };
}

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from('profiles')
    .select('qa_model_enabled, study_target_hours, hours_available')
    .eq('id', user.id).single();
  if (!profile?.qa_model_enabled) return NextResponse.json({ enabled: false }, { status: 404 });

  const state = await loadQaState(admin, user.id);

  // QA gets a share of the day. Until VARC/DILR move onto this model too, QA
  // takes ~40% of the declared daily study time (floored at 60 min so a demo
  // always has room to show a real plan).
  const dailyHours = (profile.study_target_hours ?? profile.hours_available ?? 3) as number;
  const budgetMinutes = Math.max(60, Math.round(dailyHours * 60 * 0.4));

  try {
    const sel = pickActiveTopics(state);
    const split = splitTimeBudget(budgetMinutes, sel.priority, sel.secondary);
    const revision = dueRevision(state);
    const active = [sel.priority.topic, sel.secondary?.topic].filter(Boolean) as string[];

    return NextResponse.json({
      enabled: true,
      budgetMinutes,
      core: coreProgress(state),
      revision: revision ? { topic: revision.topic, reason: revision.reason, minutes: REVISION_SESSION_MINUTES } : null,
      priority: slot(state, sel.priority, split.priorityMinutes, sel.reasons.priority),
      secondary: sel.secondary ? slot(state, sel.secondary, split.secondaryMinutes, sel.reasons.secondary!) : null,
      swapOptions: swapCandidates(state, active).slice(0, 8).map((t) => ({ topic: t.topic, cluster: t.cluster, weightage: t.weightage })),
    });
  } catch {
    // pickActiveTopics throws only when every unlocked topic is mastered — for
    // QA that means the whole section (incl. any opted-in bonus) is done.
    return NextResponse.json({ enabled: true, budgetMinutes, core: coreProgress(state), allDone: true, revision: dueRevision(state) });
  }
}
