// Saving a coaching timetable — ONE implementation, whoever is holding the pen.
//
// Founder, 7 Aug: the timetable is a premium feature the student and their
// buddy curate TOGETHER. That means two writers — the student's upload and the
// buddy's editor — and two writers with separate save paths is exactly the
// two-copies failure that bit this codebase three times today (body check vs
// API, app allowlist vs bucket, sniffer vs reality). So the whole consequence
// of saving — persist, align coverage priorities, move the plan source,
// rebuild today's plan — lives here, and both routes call it.

import { TOPIC_METADATA } from './topics-constants';
import { topicsTaught, type TimetableBlock, type CoachingTarget, type TimetableKind } from './timetable';
import { anchorToMonth, detectShape, summariseMonth, type MonthSummary } from './timetable-month';

export interface ApplyInput {
  blocks: TimetableBlock[];
  targets: CoachingTarget[];
  kind: TimetableKind;
  syllabusEndDate: string | null;
  followCoaching: boolean;
  /** Who held the pen — 'photo'/'excel' for the student's upload, 'buddy'. */
  source?: string;
}

export interface ApplyResult {
  aligned: number;
  planRebuilt: boolean;
  planSource: 'coaching' | 'careerrai';
  /** What we read, counted from the anchored month — shown straight back. */
  month: MonthSummary;
  /** Dates written to the permanent coaching_sessions record. */
  sessionsRecorded: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function applyCoachingTimetable(admin: any, studentId: string, input: ApplyInput): Promise<ApplyResult> {
  const nowIso = new Date().toISOString();

  const { error } = await admin.from('student_timetables').upsert({
    student_id: studentId,
    blocks: input.blocks,
    targets: input.targets,
    kind: input.kind,
    syllabus_end_date: input.syllabusEndDate,
    source: (input.source ?? 'photo').slice(0, 20),
    confirmed_at: nowIso,
    updated_at: nowIso,
  }, { onConflict: 'student_id' });
  if (error) throw new Error(`timetable save failed: ${error.message}`);

  const taught = topicsTaught(input.blocks);
  let aligned = 0;

  // ── The permanent record ───────────────────────────────────────────────────
  // student_timetables is ONE row per student and its `blocks` array is
  // replaced above, so month 2 used to erase month 1 — deleting the only
  // evidence of what this student's coaching had already covered. The anchored
  // month is written to coaching_sessions instead, keyed on (student, date), so
  // a new upload refines the dates it covers and leaves every earlier date
  // standing.
  const today = new Date().toISOString().slice(0, 10);
  const calendar = anchorToMonth(input.blocks, today);
  const month = summariseMonth(calendar, detectShape(input.blocks));
  const busy = calendar.filter((d) => d.topics.length > 0 || d.sections.length > 0);
  let sessionsRecorded = 0;
  if (busy.length > 0) {
    const { error: sessErr } = await admin.from('coaching_sessions').upsert(
      busy.map((d) => ({
        student_id: studentId,
        session_date: d.date,
        topics: d.topics,
        sections: d.sections,
        labels: d.labels.slice(0, 20),
        minutes: d.minutes,
        source: (input.source ?? 'photo').slice(0, 20),
        updated_at: nowIso,
      })),
      { onConflict: 'student_id,session_date' },
    );
    // A failed history write must NOT fail the upload — the student's plan is
    // already aligned and telling them the save broke would be a lie.
    if (sessErr) console.error('[timetable] coaching_sessions write failed', sessErr.message);
    else sessionsRecorded = busy.length;
  }

  const planSource = input.followCoaching ? 'coaching' as const : 'careerrai' as const;
  const profileUpdate: Record<string, unknown> = { plan_source: planSource };
  // Only a date actually PRINTED on the document may move the target, and only
  // when following coaching — an invented completion date corrupts the ring.
  if (input.followCoaching && input.syllabusEndDate) profileUpdate.syllabus_target_date = input.syllabusEndDate;
  await admin.from('profiles').update(profileUpdate).eq('id', studentId);

  if (input.followCoaching && taught.length > 0) {
    const { data: existing } = await admin
      .from('topic_coverage').select('topic').eq('student_id', studentId).in('topic', taught);
    const have = new Set((existing ?? []).map((r: { topic: string }) => r.topic));

    const toInsert = taught
      .filter((t) => !have.has(t))
      .map((t) => ({
        student_id: studentId,
        section: TOPIC_METADATA[t]?.section ?? 'QA',
        topic: t,
        status: 'not_started',
        is_priority: true,
      }));
    if (toInsert.length > 0) {
      await admin.from('topic_coverage')
        .upsert(toInsert, { onConflict: 'student_id,section,topic', ignoreDuplicates: true });
    }
    if (have.size > 0) {
      await admin.from('topic_coverage')
        .update({ is_priority: true }).eq('student_id', studentId).in('topic', [...have]);
    }
    aligned = taught.length;
  } else if (!input.followCoaching && taught.length > 0) {
    // Opting out withdraws the priority hint; statuses are untouched.
    await admin.from('topic_coverage')
      .update({ is_priority: false }).eq('student_id', studentId).in('topic', taught);
  }

  // Today's plan must FEEL the save (founder, 7 Aug: "my study plan didn't get
  // aligned — then what's the benefit of uploading?"). Drop today's routine so
  // the next open rebuilds with today's class topics — never over ticked work.
  let planRebuilt = false;
  if (input.followCoaching) {
    const { data: done } = await admin
      .from('routine_task_completions')
      .select('task_id').eq('student_id', studentId).eq('routine_date', today).limit(1);
    if (!done || done.length === 0) {
      await admin.from('daily_routines').delete().eq('student_id', studentId).eq('routine_date', today);
      planRebuilt = true;
    }
  }

  return { aligned, planRebuilt, planSource, month, sessionsRecorded };
}
