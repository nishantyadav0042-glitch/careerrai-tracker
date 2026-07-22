// QA Mastery state <-> database. Loads a QaStudentState from qa_topic_progress,
// SEEDING it once from the student's existing topic_coverage the first time (so
// "your progress till date is maintained" is literally true, not a slogan —
// founder, E1), and persists mutations back.

import type { QaStudentState, StudentTopicProgress } from './qa-mastery-engine';
import type { QaStage } from './qa-topic-graph';
import { QA_TOPICS_BY_NAME } from './qa-topic-graph';

/* eslint-disable @typescript-eslint/no-explicit-any */

const DAY = 86_400_000;

// Existing coverage status -> new ladder stage. A clean 1:1, so a student who
// had a topic at 'practicing' lands at 'medium', never back at square one.
export function statusToStage(status: string | null | undefined): QaStage {
  switch (status) {
    case 'exam_ready': return 'exam_ready';
    case 'revising': return 'hard';
    case 'practicing': return 'medium';
    case 'learning': return 'easy';
    default: return 'concept';
  }
}

function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY));
}

function rowToProgress(r: any): StudentTopicProgress {
  return {
    topic: r.topic,
    stage: r.stage as QaStage,
    sessionsDoneAtStage: r.sessions_done_at_stage ?? 0,
    initialRevisionSessionsDone: r.initial_revision_sessions_done ?? 0,
    lastTouchedDaysAgo: daysAgo(r.last_touched_at ?? null),
    conceptStruggles: r.concept_struggles ?? 0,
    calcStruggles: r.calc_struggles ?? 0,
    revisionMisses: r.revision_misses ?? 0,
    mockFlaggedForRevision: r.mock_flagged === true,
  };
}

// Load the student's full QA state. On first ever load (no qa_topic_progress
// rows), seed from topic_coverage so nothing is lost, then persist the seed.
export async function loadQaState(admin: any, studentId: string): Promise<QaStudentState> {
  const [{ data: rows }, { data: profile }] = await Promise.all([
    admin.from('qa_topic_progress').select('*').eq('student_id', studentId),
    admin.from('profiles').select('qa_include_bonus').eq('id', studentId).single(),
  ]);

  const progressByTopic = new Map<string, StudentTopicProgress>();

  if ((rows ?? []).length === 0) {
    // First time on the new model — seed from existing coverage (QA topics only).
    const { data: coverage } = await admin
      .from('topic_coverage').select('topic, status, updated_at').eq('student_id', studentId);
    const seedRows: any[] = [];
    for (const c of (coverage ?? [])) {
      if (!QA_TOPICS_BY_NAME.has(c.topic)) continue;
      const stage = statusToStage(c.status);
      const p: StudentTopicProgress = {
        topic: c.topic, stage, sessionsDoneAtStage: 0, initialRevisionSessionsDone: 0,
        lastTouchedDaysAgo: daysAgo(c.updated_at ?? null),
        conceptStruggles: 0, calcStruggles: 0, revisionMisses: 0, mockFlaggedForRevision: false,
      };
      progressByTopic.set(c.topic, p);
      seedRows.push({
        student_id: studentId, topic: c.topic, stage, last_touched_at: c.updated_at ?? null,
      });
    }
    if (seedRows.length > 0) {
      await admin.from('qa_topic_progress').upsert(seedRows, { onConflict: 'student_id,topic' });
    }
  } else {
    for (const r of rows) progressByTopic.set(r.topic, rowToProgress(r));
  }

  // Today's swap overrides (survive an app restart within the day).
  const today = new Date().toISOString().slice(0, 10);
  const { data: swap } = await admin
    .from('qa_daily_plan').select('swapped_priority, swapped_secondary')
    .eq('student_id', studentId).eq('plan_date', today).maybeSingle();

  return {
    includeBonus: profile?.qa_include_bonus === true,
    progressByTopic,
    swappedIn: {
      priority: swap?.swapped_priority ?? undefined,
      secondary: swap?.swapped_secondary ?? undefined,
    },
  };
}

// Persist one topic's progress (called after a log/revision mutates it).
export async function saveTopicProgress(admin: any, studentId: string, p: StudentTopicProgress): Promise<void> {
  await admin.from('qa_topic_progress').upsert({
    student_id: studentId,
    topic: p.topic,
    stage: p.stage,
    sessions_done_at_stage: p.sessionsDoneAtStage,
    initial_revision_sessions_done: p.initialRevisionSessionsDone,
    last_touched_at: p.lastTouchedDaysAgo === 0 ? new Date().toISOString() : undefined,
    concept_struggles: p.conceptStruggles,
    calc_struggles: p.calcStruggles,
    revision_misses: p.revisionMisses,
    mock_flagged: p.mockFlaggedForRevision,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'student_id,topic' });
}

// Record today's swap choice for a slot (or clear it with null).
export async function saveSwap(admin: any, studentId: string, slot: 'priority' | 'secondary', topic: string | null): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const col = slot === 'priority' ? 'swapped_priority' : 'swapped_secondary';
  await admin.from('qa_daily_plan').upsert(
    { student_id: studentId, plan_date: today, [col]: topic },
    { onConflict: 'student_id,plan_date' }
  );
}
