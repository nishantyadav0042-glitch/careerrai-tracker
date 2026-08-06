import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { setDailyHours, normaliseHours, MIN_DAILY_HOURS, MAX_DAILY_HOURS } from '@/lib/daily-hours';
import { serverError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

// THE place a student's daily hours change.
//
// Founder, 6 Aug: "one number, one owner, one place it can change."
//
// The owner is the student, so this endpoint only ever writes the caller's own
// row, and only from a number they sent. There is no derivation here and there
// must never be one: not from their finish date, not from what they logged last
// week, not from what we think they can sustain. Those inputs are exactly what
// produced a student setting 11 hours and being handed a four-hour plan.
//
// Confirming the existing number and changing it are the same write, on purpose.
// Both mean "this number is mine", which is the fact worth recording, and after
// either one the in-app confirmation card is gone for good.
export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { hours?: unknown };
  const hours = normaliseHours(body.hours);
  if (hours == null) {
    return NextResponse.json(
      { error: `Daily hours must be between ${MIN_DAILY_HOURS} and ${MAX_DAILY_HOURS}.` },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('profiles')
    // Through setDailyHours so the mirror column and the provenance stamp can
    // never be forgotten at a call site.
    .update(setDailyHours(hours, 'student'))
    .eq('id', user.id);
  if (error) return serverError('daily-hours', error);

  // Today's plan was sized to the old number. Dropping the row lets the next
  // /api/routine/today rebuild it at the new one — but only when nothing has
  // been ticked yet, because completed work is never wiped by a resize. If they
  // have already started, today stands and tomorrow uses the new number.
  const today = new Date().toISOString().slice(0, 10);
  const { data: done } = await admin
    .from('routine_task_completions')
    .select('task_id')
    .eq('student_id', user.id)
    .eq('routine_date', today)
    .limit(1);
  if (!done || done.length === 0) {
    await admin.from('daily_routines').delete().eq('student_id', user.id).eq('routine_date', today);
  }

  return NextResponse.json({ ok: true, hours, planRebuilt: !done || done.length === 0 });
}
