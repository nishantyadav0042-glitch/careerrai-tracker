import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { dailyHours as studentDailyHours } from '@/lib/daily-hours';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadMasteryState } from '@/lib/mastery-state';
import { sectionConfig, sectionBudgetShare, isSectionReady, sectionNotReadyReason } from '@/lib/mastery-sections';
import { stageLabel, REVISION_SESSION_MINUTES, type MasteryTopicSpec } from '@/lib/mastery-engine';

// GET /api/mastery/[section]/today — the mastery plan for one section. Gated by
// that section's profiles.<section>_model_enabled flag (E3 rollout): off → 404
// so the caller falls back to the legacy routine.

export async function GET(_req: Request, { params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const cfg = sectionConfig(section);
  if (!cfg) return NextResponse.json({ error: 'Unknown section' }, { status: 404 });

  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data } = await admin
    .from('profiles')
    .select('qa_model_enabled, dilr_model_enabled, varc_model_enabled, qa_include_bonus, dilr_include_bonus, varc_include_bonus, study_target_hours, hours_available')
    .eq('id', user.id).single();
  const profile = data as Record<string, unknown> | null;
  if (!profile || profile[cfg.enabledCol] !== true) {
    return NextResponse.json({ enabled: false }, { status: 404 });
  }

  // The flag says on; the model must also agree with the hours we already
  // quote this student. Serving a plan built on a different hour total is how
  // a student ends up holding two contradictory answers at once.
  if (!isSectionReady(cfg)) {
    console.error('[mastery] blocked —', sectionNotReadyReason(cfg));
    return NextResponse.json({ enabled: false }, { status: 404 });
  }

  const includeBonus = profile[cfg.bonusCol] === true;
  const state = await loadMasteryState(admin, user.id, cfg.key, cfg.graph.byName, includeBonus);

  // Cross-section time weighting: give this section its normalised share of the
  // day, over whichever mastery sections the student has enabled. QA is heaviest
  // (widest syllabus); a single-section student still gets their whole budget.
  const enabledKeys = [
    profile.qa_model_enabled === true ? 'QA' : null,
    profile.dilr_model_enabled === true ? 'DILR' : null,
    profile.varc_model_enabled === true ? 'VARC' : null,
  ].filter(Boolean) as string[];
  const dailyHours = studentDailyHours(profile).weekday ?? 3;
  const share = sectionBudgetShare(cfg.key, enabledKeys);
  const budgetMinutes = Math.max(60, Math.round(dailyHours * 60 * share));
  const e = cfg.engine;

  const slot = (spec: MasteryTopicSpec, minutes: number, why: string) => {
    const plan = e.sessionsForBudget(state, spec, minutes);
    return {
      topic: spec.topic, cluster: spec.cluster, stage: plan.stage, stageLabel: stageLabel(plan.stage),
      stageNumber: cfg.graph.stageOrder.indexOf(plan.stage) + 1, stageTotal: cfg.graph.stageOrder.length,
      sessionsToday: plan.sessionsToday, minutes: plan.minutesUsed,
      sessionsRemainingAtStage: plan.sessionsRemainingAtStage, target: e.taskCopy(spec, plan), why,
    };
  };

  try {
    const sel = e.pickActiveTopics(state);
    const split = e.splitTimeBudget(budgetMinutes, sel.priority, sel.secondary);
    const revision = e.dueRevision(state);
    const active = [sel.priority.topic, sel.secondary?.topic].filter(Boolean) as string[];
    return NextResponse.json({
      enabled: true, section: cfg.key, label: cfg.label, budgetMinutes,
      core: e.coreProgress(state),
      revision: revision ? { topic: revision.topic, reason: revision.reason, minutes: REVISION_SESSION_MINUTES } : null,
      priority: slot(sel.priority, split.priorityMinutes, sel.reasons.priority),
      secondary: sel.secondary ? slot(sel.secondary, split.secondaryMinutes, sel.reasons.secondary!) : null,
      swapOptions: e.swapCandidates(state, active).slice(0, 8).map((t) => ({ topic: t.topic, cluster: t.cluster, weightage: t.weightage })),
    });
  } catch {
    return NextResponse.json({ enabled: true, section: cfg.key, label: cfg.label, budgetMinutes, core: e.coreProgress(state), allDone: true, revision: e.dueRevision(state) });
  }
}
