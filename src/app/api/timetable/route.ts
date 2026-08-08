import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sanitizeBlocks, sanitizeSyllabusEndDate, sanitizeTargets, isTimetableKind, type TimetableBlock } from '@/lib/timetable';
import { timetableDailyHours } from '@/lib/timetable-align';
import { anchorToMonth, monthDaysLeft } from '@/lib/timetable-month';
import { applyCoachingTimetable } from '@/lib/timetable-apply';
import { dailyHours } from '@/lib/daily-hours';

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
    admin.from('profiles').select('plan_source, coaching_enrolled, is_premium').eq('id', user.id).maybeSingle(),
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
    isPremium: prof?.is_premium === true,
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

  // FREE FOR EVERY STUDENT (founder, 8 Aug). This was premium-gated for a day,
  // and the evidence says that was backwards: 70–80% of serious aspirants
  // already have a coaching timetable, so turning that sheet into an aligned
  // daily plan is the fastest proof we can offer that we save them work — and
  // we were charging for it before anyone had a reason to trust us.
  //
  // The line we hold instead: the MACHINE is free, the HUMAN is paid. Uploading,
  // reading and aligning a timetable is automation and costs us cents. A mentor
  // sitting with you to curate it (api/buddy/student-timetable) is a person's
  // hours, and that stays premium.
  const kind = isTimetableKind(body.kind) ? body.kind : 'weekly';
  // Re-sanitized server-side: this date can move the student's whole target,
  // so a client is never trusted to supply it unchecked.
  const syllabusEndDate = sanitizeSyllabusEndDate(body.syllabusEndDate);
  // Default true — a student uploading a timetable is telling us to use it.
  const followCoaching = body.followCoaching !== false;

  // Persist + align + rebuild through the ONE apply path the buddy editor
  // also uses — two writers, one consequence.
  let applied: Awaited<ReturnType<typeof applyCoachingTimetable>>;
  try {
    applied = await applyCoachingTimetable(admin, user.id, {
      blocks, targets, kind, syllabusEndDate, followCoaching,
      source: typeof body.source === 'string' ? body.source : 'photo',
    });
  } catch (e) {
    console.error('[timetable]', String(e));
    return NextResponse.json({ error: 'Could not save your timetable. Please try again.' }, { status: 500 });
  }
  const aligned = applied.aligned;
  const planSource = applied.planSource;
  const planRebuilt = applied.planRebuilt;

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

  // The month we read, played straight back so the student can check it
  // against the sheet in their hand. Every figure is COUNTED from the anchored
  // calendar rather than described — "31 days, 24 with classes, 18 topics" is
  // checkable; "we understood your timetable" is not.
  const today = new Date().toISOString().slice(0, 10);
  const calendar = anchorToMonth(blocks, today);
  return NextResponse.json({
    ok: true, blocks: blocks.length, targets: targets.length, alignedTopics: aligned,
    planRebuilt, hoursMismatch,
    month: applied.month,
    sessionsRecorded: applied.sessionsRecorded,
    // Only the days that carry something — an empty day needs no row on screen.
    days: calendar
      .filter((d) => d.topics.length > 0 || d.sections.length > 0)
      .map((d) => ({ date: d.date, topics: d.topics, sections: d.sections })),
    monthDaysLeft: monthDaysLeft(calendar, today),
    planSource, syllabusEndDate: followCoaching ? syllabusEndDate : null,
  });
}
