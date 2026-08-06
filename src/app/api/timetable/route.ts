import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sanitizeBlocks, topicsTaught, sanitizeSyllabusEndDate, sanitizeTargets, isTimetableKind, type TimetableBlock } from '@/lib/timetable';
import { timetableDailyHours, horizonDaysLeft } from '@/lib/timetable-align';
import { dailyHours } from '@/lib/daily-hours';
import { TOPIC_METADATA } from '@/lib/topics-constants';

// GET  — the student's saved timetable (or null).
// POST — save the blocks the student CONFIRMED, then align the plan.
//
// The alignment is deliberately boring: confirmed coaching topics are flagged
// is_priority on topic_coverage, and the existing planner already boosts
// priority topics (see buildTopicChoices in lib/routine-plan.ts). So the study
// plan starts leaning toward what coaching is actually teaching WITHOUT any
// change to the planning engine, and without a model ever choosing a topic.

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const admin = createAdminClient();
  const [{ data }, { data: prof }] = await Promise.all([
    admin.from('student_timetables')
      .select('blocks, targets, kind, syllabus_end_date, confirmed_at').eq('student_id', user.id).maybeSingle(),
    admin.from('profiles').select('plan_source, coaching_enrolled').eq('id', user.id).maybeSingle(),
  ]);

  return NextResponse.json({
    timetable: data ? {
      blocks: sanitizeBlocks(data.blocks),
      targets: sanitizeTargets(data.targets),
      kind: data.kind ?? 'weekly',
      syllabusEndDate: data.syllabus_end_date ?? null,
      confirmedAt: data.confirmed_at,
    } : null,
    planSource: prof?.plan_source ?? 'careerrai',
    coachingEnrolled: prof?.coaching_enrolled ?? null,
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    blocks?: unknown; targets?: unknown; source?: string; kind?: unknown;
    syllabusEndDate?: unknown; followCoaching?: unknown;
  };
  // Re-sanitize on the way in. The client already validated, but a client is
  // never the authority on what reaches the database.
  const blocks: TimetableBlock[] = sanitizeBlocks(body.blocks);
  const targets = sanitizeTargets(body.targets);
  // A targets-only upload is completely valid — most coachings hand out a
  // production quota rather than a class timetable.
  if (blocks.length === 0 && targets.length === 0) {
    return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const kind = isTimetableKind(body.kind) ? body.kind : 'weekly';
  // Re-sanitized server-side: this date can move the student's whole target,
  // so a client is never trusted to supply it unchecked.
  const syllabusEndDate = sanitizeSyllabusEndDate(body.syllabusEndDate);
  // Default true — a student uploading a timetable is telling us to use it.
  const followCoaching = body.followCoaching !== false;

  const { error } = await admin.from('student_timetables').upsert({
    student_id: user.id,
    blocks,
    targets,
    kind,
    syllabus_end_date: syllabusEndDate,
    source: typeof body.source === 'string' ? body.source.slice(0, 20) : 'photo',
    confirmed_at: nowIso,
    updated_at: nowIso,
  }, { onConflict: 'student_id' });

  if (error) {
    console.error('[timetable] save failed', error.message);
    return NextResponse.json({ error: 'Could not save your timetable. Please try again.' }, { status: 500 });
  }

  // ── Alignment ──────────────────────────────────────────────────────────
  // Flag every confirmed coaching topic as a priority. Existing coverage rows
  // are updated; missing ones are created as 'not_started' so a topic coaching
  // teaches next week still counts. Never downgrades an existing status.
  const taught = topicsTaught(blocks);
  let aligned = 0;

  // The student's explicit choice. Following coaching prioritises their topics;
  // choosing our own plan stores the timetable (so class times are still known)
  // but leaves topic selection entirely to our engine.
  const planSource = followCoaching ? 'coaching' : 'careerrai';
  const profileUpdate: Record<string, unknown> = { plan_source: planSource };

  // Only a date actually PRINTED on the document may move the target, and only
  // when the student chose to follow coaching. Otherwise our own projection
  // stands — an invented completion date would corrupt the pace ring.
  if (followCoaching && syllabusEndDate) profileUpdate.syllabus_target_date = syllabusEndDate;
  await admin.from('profiles').update(profileUpdate).eq('id', user.id);

  if (followCoaching && taught.length > 0) {
    const { data: existing } = await admin
      .from('topic_coverage')
      .select('topic')
      .eq('student_id', user.id)
      .in('topic', taught);

    const have = new Set((existing ?? []).map((r) => r.topic as string));

    const toInsert = taught
      .filter((t) => !have.has(t))
      .map((t) => ({
        student_id: user.id,
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
        .update({ is_priority: true })
        .eq('student_id', user.id)
        .in('topic', [...have]);
    }
    aligned = taught.length;
  } else if (!followCoaching && taught.length > 0) {
    // Switching back to our own plan: clear the priority flags a previous
    // coaching alignment set, so a stale coaching bias can't keep steering the
    // planner after the student opted out. Status is untouched — only the
    // priority hint is withdrawn.
    await admin.from('topic_coverage')
      .update({ is_priority: false })
      .eq('student_id', user.id)
      .in('topic', taught);
  }
  // No server-side event: the client fires 'timetable_saved' via journey.ts
  // for this same action — the extra context-less 'timetable_confirmed' row
  // made every timetable count ambiguous (two names, two rows, one action).
  // TODAY'S PLAN MUST FEEL THE UPLOAD. It was generated before this timetable
  // existed, and nothing else invalidates it — which is exactly what the
  // founder hit: "my study plan didn't get aligned with the updated timetable,
  // then what's the benefit of uploading?" Same rule as a daily-hours change:
  // drop today's routine so the next open rebuilds with the timetable's
  // today-class topics — but never over completed work.
  let planRebuilt = false;
  if (followCoaching) {
    const today = new Date().toISOString().slice(0, 10);
    const { data: done } = await admin
      .from('routine_task_completions')
      .select('task_id')
      .eq('student_id', user.id)
      .eq('routine_date', today)
      .limit(1);
    if (!done || done.length === 0) {
      await admin.from('daily_routines').delete().eq('student_id', user.id).eq('routine_date', today);
      planRebuilt = true;
    }
  }

  // The hours CHECK (founder: "calculate or check their hours as per their
  // updated timetable"). Never a write — the one-owner rule stands. The
  // client shows the mismatch and the student decides with a tap.
  const impliedHours = timetableDailyHours(blocks);
  const { data: hoursRow } = await admin
    .from('profiles')
    .select('study_target_hours, hours_available, weekend_hours_available')
    .eq('id', user.id)
    .single();
  const currentHours = dailyHours(hoursRow).weekday;
  const hoursMismatch =
    impliedHours != null && currentHours != null && Math.abs(impliedHours - currentHours) >= 1
      ? { timetableHours: impliedHours, currentHours }
      : null;

  return NextResponse.json({
    ok: true, blocks: blocks.length, targets: targets.length, alignedTopics: aligned,
    planRebuilt, hoursMismatch,
    horizonDaysLeft: horizonDaysLeft(blocks, new Date().toISOString().slice(0, 10)),
    planSource, syllabusEndDate: followCoaching ? syllabusEndDate : null,
  });
}
