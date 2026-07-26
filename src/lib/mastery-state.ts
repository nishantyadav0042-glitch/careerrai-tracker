// Mastery state <-> database, section-aware (QA / DILR / VARC). Loads a
// MasteryStudentState for one section from qa_topic_progress (the table is now
// section-scoped), SEEDING once from the student's existing topic_coverage the
// first time so progress-to-date is preserved, and persists mutations.

import { studyDayString } from '@/lib/study-day';
import type { MasteryStudentState, StudentTopicProgress, Stage, MasteryTopicSpec } from './mastery-engine';
import { getLogDateString, VALID_SECTIONS } from './streak-utils';

/* eslint-disable @typescript-eslint/no-explicit-any */

const DAY = 86_400_000;

// Mastery stage -> legacy topic_coverage status. Chosen so it round-trips
// stably with statusToStage above: seeding a coverage status into a stage and
// mirroring that stage back yields the SAME status (no phantom up/downgrade).
//   learning  <-> easy/concept · practicing <-> medium · revising <-> hard
const STAGE_TO_STATUS: Record<Stage, string> = {
  concept: 'learning', easy: 'learning', medium: 'practicing', hard: 'revising', exam_ready: 'exam_ready',
};

// Existing coverage status → new ladder stage (1:1) so nobody restarts at zero.
export function statusToStage(status: string | null | undefined): Stage {
  switch (status) {
    case 'mastered':                    // legacy "fully confident" status — must
    case 'exam_ready': return 'exam_ready'; // NOT reset a mastered topic to Concept
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
    stage: r.stage as Stage,
    sessionsDoneAtStage: r.sessions_done_at_stage ?? 0,
    initialRevisionSessionsDone: r.initial_revision_sessions_done ?? 0,
    lastTouchedDaysAgo: daysAgo(r.last_touched_at ?? null),
    conceptStruggles: r.concept_struggles ?? 0,
    calcStruggles: r.calc_struggles ?? 0,
    revisionMisses: r.revision_misses ?? 0,
    mockFlaggedForRevision: r.mock_flagged === true,
  };
}

export async function loadMasteryState(
  admin: any, studentId: string, section: string,
  byName: Map<string, MasteryTopicSpec>, includeBonus: boolean,
): Promise<MasteryStudentState> {
  const { data: rows, error: rowsErr } = await admin.from('qa_topic_progress').select('*').eq('student_id', studentId).eq('section', section);
  if (rowsErr) console.error('[mastery-state] load progress failed', { section, error: rowsErr.message });
  const progressByTopic = new Map<string, StudentTopicProgress>();

  if ((rows ?? []).length === 0) {
    // First time on the new model for this section — seed from topic_coverage,
    // filtered to THIS section's topics (topic_coverage holds all sections).
    const { data: coverage } = await admin.from('topic_coverage').select('topic, status, updated_at').eq('student_id', studentId).eq('section', section);
    const seedRows: any[] = [];
    for (const c of (coverage ?? [])) {
      if (!byName.has(c.topic)) continue;
      const stage = statusToStage(c.status);
      progressByTopic.set(c.topic, {
        topic: c.topic, stage, sessionsDoneAtStage: 0, initialRevisionSessionsDone: 0,
        lastTouchedDaysAgo: daysAgo(c.updated_at ?? null),
        conceptStruggles: 0, calcStruggles: 0, revisionMisses: 0, mockFlaggedForRevision: false,
      });
      seedRows.push({ student_id: studentId, section, topic: c.topic, stage, last_touched_at: c.updated_at ?? null });
    }
    // ignoreDuplicates (INSERT … ON CONFLICT DO NOTHING) so a seed racing a
    // concurrent "Got it" write can never overwrite a real progress row.
    if (seedRows.length > 0) {
      const { error: seedErr } = await admin.from('qa_topic_progress').upsert(seedRows, { onConflict: 'student_id,section,topic', ignoreDuplicates: true });
      if (seedErr) console.error('[mastery-state] seed failed', { section, error: seedErr.message });
    }
  } else {
    for (const r of rows) progressByTopic.set(r.topic, rowToProgress(r));
  }

  const today = studyDayString();  // study day, not UTC — must match the write below
  const { data: swap } = await admin.from('qa_daily_plan')
    .select('swapped_priority, swapped_secondary')
    .eq('student_id', studentId).eq('section', section).eq('plan_date', today).maybeSingle();

  return {
    includeBonus,
    progressByTopic,
    swappedIn: { priority: swap?.swapped_priority ?? undefined, secondary: swap?.swapped_secondary ?? undefined },
  };
}

export async function saveTopicProgress(admin: any, studentId: string, section: string, p: StudentTopicProgress): Promise<void> {
  const { error } = await admin.from('qa_topic_progress').upsert({
    student_id: studentId, section, topic: p.topic, stage: p.stage,
    sessions_done_at_stage: p.sessionsDoneAtStage,
    initial_revision_sessions_done: p.initialRevisionSessionsDone,
    last_touched_at: p.lastTouchedDaysAgo === 0 ? new Date().toISOString() : undefined,
    concept_struggles: p.conceptStruggles, calc_struggles: p.calcStruggles,
    revision_misses: p.revisionMisses, mock_flagged: p.mockFlaggedForRevision,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'student_id,section,topic' });
  // Surface the write failure instead of returning a false success to the UI —
  // a swallowed error here means a "Got it" tap that silently saved nothing.
  if (error) throw new Error(`saveTopicProgress(${section}/${p.topic}): ${error.message}`);
}

export async function saveSwap(admin: any, studentId: string, section: string, slot: 'priority' | 'secondary', topic: string | null): Promise<void> {
  const today = studyDayString();  // study day, not UTC — must match the write below
  const col = slot === 'priority' ? 'swapped_priority' : 'swapped_secondary';
  const { error } = await admin.from('qa_daily_plan').upsert(
    { student_id: studentId, section, plan_date: today, [col]: topic },
    { onConflict: 'student_id,section,plan_date' }
  );
  if (error) throw new Error(`saveSwap(${section}/${slot}): ${error.message}`);
}

// ── Mastery -> legacy sync bridge ─────────────────────────────────────────
// The Mastery plan is the source of truth for a Mastery-enabled student, but
// the rest of the app (Home, pace, Analysis matrix, Buddy, analytics, the daily
// routine) reads topic_coverage / daily_reports / streak_data. Without these
// two writes, Mastery progress is invisible everywhere else and a Mastery-only
// day never logs or keeps a streak. Called from the study/revision log path.

// Mirror a topic's Mastery stage into topic_coverage so every legacy surface
// shows the same progress. Idempotent upsert; never downgrades a topic (the
// stage only climbs, and the mapping round-trips with the seed).
export async function syncCoverageFromMastery(admin: any, studentId: string, section: string, topic: string, stage: Stage): Promise<void> {
  const { error } = await admin.from('topic_coverage').upsert(
    { student_id: studentId, section, topic, status: STAGE_TO_STATUS[stage], updated_at: new Date().toISOString() },
    { onConflict: 'student_id,section,topic' }
  );
  if (error) console.error('[mastery-state] coverage sync failed', { section, topic, error: error.message });
}

// Credit a Mastery study/revision session to the SAME daily-log + streak system
// the routine card and manual log use (upsert_log_and_streak), so a student who
// works only inside the Mastery plan still "logged today" and keeps their
// streak. Merges with any existing daily_report — max hours, union of sections,
// preserves mock/notes — so it never shrinks a log the student already made.
export async function creditMasteryStudyDay(admin: any, studentId: string, sectionKey: string, minutes: number): Promise<void> {
  const today = getLogDateString();
  const { data: existing } = await admin
    .from('daily_reports')
    .select('study_duration, topics_covered, mock_taken, notes')
    .eq('student_id', studentId).eq('report_date', today).maybeSingle();

  const sectionTag = (VALID_SECTIONS as readonly string[]).includes(sectionKey) ? [sectionKey] : [];
  const mergedHours = Math.max(1, Math.round(minutes / 60), existing?.study_duration ?? 0);
  const mergedSections = [...new Set([...(existing?.topics_covered ?? []), ...sectionTag])];

  const { error } = await admin.rpc('upsert_log_and_streak', {
    p_student_id: studentId,
    p_report_date: today,
    p_study_duration: mergedHours,
    p_topics_covered: mergedSections,
    p_mood_emoji: '💪',
    p_mock_taken: !!existing?.mock_taken,
    p_notes: existing?.notes ?? null,
    p_emotional_chips: [],
  });
  if (error) console.error('[mastery-state] study-day credit failed', { error: error.message });
}
