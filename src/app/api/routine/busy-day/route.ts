import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getLogDateString } from '@/lib/streak-utils';
import { mutatePlanTasks } from '@/lib/plan-mutate';
import { shiftIsoDay, busyDayOutcome, type BusyDayVerdict } from '@/lib/busy-day';

// POST /api/routine/busy-day — "Busy day (personal commitments)".
//
// Founder, 8 Aug: on a day the student says they were busy and could not
// study, shift the whole plan AND the target syllabus date forward by one day.
// What they were going to study today, they study tomorrow.
//
// This replaces the bad-day floor, which asked a student at signup to predict
// how bad their worst day would be and then fought with their hours over which
// number sized the plan. A busy day is not predictable. It is reported.
//
// Nothing new was invented to move the work: the planner already honours a
// promise to bring a topic back. A swapped-out topic scores +50 in the topic
// selector — above even today's coaching class at +45 — with the reason "Back
// from yesterday's swap — as promised". A busy day simply swaps out the whole
// day, so tomorrow opens on exactly what today was going to be.
//
// COACHING STUDENTS ARE EXCLUDED, and that is a rule, not an omission
// (founder: "This won't happen in coaching student case"). Their plan is
// mapped to what their class teaches on a given date. Shifting it by a day
// would put them a day behind their own classroom — we would be desynchronised
// from the one schedule they cannot move. For them the honest answer is that
// class happened without them and the catch-up is theirs to make; what we do
// is keep advising what class covered, and carry the revision.

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const admin = createAdminClient();
  const today = getLogDateString();

  const { data: profile } = await admin.from('profiles')
    .select('plan_source, syllabus_target_date, attempt_year')
    .eq('id', user.id).maybeSingle();

  const verdict: BusyDayVerdict = busyDayOutcome({
    planSource: (profile?.plan_source as string | null) ?? null,
    targetDate: (profile?.syllabus_target_date as string | null) ?? null,
    attemptYear: (profile?.attempt_year as number | null) ?? null,
    today,
  });

  if (!verdict.shift) {
    // A refusal that explains itself. Logged either way so we can see how
    // often coaching students reach for this — if it is often, the coaching
    // branch needs its own answer rather than a message.
    admin.from('student_events').insert({
      user_id: user.id, event: 'busy_day_declined',
      props: { reason: verdict.reason }, path: null,
    }).then(({ error }) => { if (error) console.error('[busy-day] event failed', error.message); });
    return NextResponse.json({ shifted: false, reason: verdict.reason, message: verdict.message });
  }

  // 1. Today's topics become a promise, not a failure. Merged with anything
  //    already swapped out today so a manual swap earlier is not overwritten
  //    — and now under compare-and-swap, so a swap landing at the same moment
  //    cannot be erased by this write (or erase it). See lib/plan-mutate.
  const postponeResult = await mutatePlanTasks<string[]>(admin, user.id, today, (row) => {
    const tasks = row.tasks as { topic?: string | null }[];
    const already = Array.isArray(row.swapped_out) ? (row.swapped_out as string[]) : [];
    const postponed = [...new Set([
      ...already,
      ...tasks.map((t) => t.topic).filter((t): t is string => typeof t === 'string' && t.length > 0),
    ])];
    return { ok: true, value: postponed, patch: { swapped_out: postponed } };
  });
  // A 404 means there is no plan today — nothing to postpone, and the date
  // may still move. Any other failure means tomorrow would NOT carry today's
  // work forward, which is the entire promise, so the date must not move.
  if (!postponeResult.ok && postponeResult.status !== 404) {
    console.error('[busy-day] could not postpone', postponeResult.error);
    return NextResponse.json({ error: 'Could not move today — try again.' }, { status: 500 });
  }
  const postponed = postponeResult.ok ? postponeResult.value : [];

  // 2. The date gives. It is the only thing that ever gives (lib/daily-hours:
  //    "the date gives, the hours don't"), and a busy day is exactly that.
  // The response below tells the student their finish date moved, and the
  // button prints the new date. That claim has to be TRUE: this error was
  // only logged, so a failed write still produced "New finish date: 21 Aug"
  // on screen while the profile kept the old one. Report what actually
  // happened. (Backbone audit, 13 Aug.)
  let dateShifted = false;
  if (verdict.newTargetDate) {
    const { error } = await admin.from('profiles')
      .update({ syllabus_target_date: verdict.newTargetDate })
      .eq('id', user.id);
    if (error) console.error('[busy-day] date shift failed', error.message);
    else dateShifted = true;
  }

  admin.from('student_events').insert({
    user_id: user.id, event: 'busy_day',
    props: {
      postponed: postponed.length,
      from: verdict.previousTargetDate,
      to: verdict.newTargetDate,
      hitExamWall: verdict.hitExamWall,
    },
    path: null,
  }).then(({ error }) => { if (error) console.error('[busy-day] event failed', error.message); });

  return NextResponse.json({
    shifted: true,
    postponed: postponed.length,
    previousTargetDate: verdict.previousTargetDate,
    // Null unless the write actually landed — the UI only prints a new date
    // when there is one.
    newTargetDate: dateShifted ? verdict.newTargetDate : null,
    hitExamWall: verdict.hitExamWall,
    message: verdict.message,
  });
}

export { shiftIsoDay };
