import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// The student overruling the capacity engine.
//
// The engine sizes a day to what someone has actually been sustaining, so the
// plan is completable rather than aspirational. Right by default, wrong as an
// absolute: two weeks at 2h during exam season should not tell a student for
// the next fortnight that they ARE a 2h person. Our memory of them must not
// become their ceiling — so the ceiling has a door, and this is it.
//
// Deliberately writes nothing else. It does not touch study_target_hours: the
// claim is what they committed to and stays theirs. This records only how the
// plan is SIZED against it, which is a different decision.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const sizing = body?.sizing;
  // Allow-list, not a cast. An unknown value must be rejected loudly rather
  // than written and later read back as something the check constraint bounces.
  if (sizing !== 'adaptive' && sizing !== 'full') {
    return NextResponse.json({ error: 'Invalid sizing' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('profiles')
    .update({ plan_sizing: sizing })
    .eq('id', user.id);

  if (error) {
    console.error('[plan-sizing]', error);
    return NextResponse.json({ error: 'Could not update' }, { status: 500 });
  }

  // Today's routine was generated under the OLD sizing, so it must go or the
  // student taps the button and sees the same small plan staring back — the
  // exact "nothing happened" that sent them to us in the first place.
  //
  // Verified safe rather than assumed:
  //   - NOTHING has a foreign key to daily_routines, so this cannot cascade.
  //   - Ticks live in routine_task_completions, keyed (student, date, task_id),
  //     and task ids are deterministic slugs from routine-engine
  //     ('qa-priority', 'varc-set', 'mock-or-review'), not random. A regenerated
  //     plan reuses the same id for the same task, so anything already ticked
  //     comes back ticked.
  //   - computeTodaysPlan regenerates on the next read, so no row is needed.
  const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  await admin.from('daily_routines').delete().eq('student_id', user.id).eq('routine_date', today);

  return NextResponse.json({ ok: true, sizing });
}
