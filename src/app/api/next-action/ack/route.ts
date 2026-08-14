import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { studyDayStart } from '@/lib/study-day';

// The student telling us directly what happened.
//
// The reconcile cron infers an outcome from coverage timestamps 36 hours later,
// which is coarse and late. A student tapping "Done" is a clean, immediate
// label — far better training data for the ranking loop than an inference, and
// it arrives while the recommendation is still relevant.
//
// Only 'followed' is accepted here. "Not yet" deliberately writes nothing: a
// student who hasn't got to it at 9pm may well do it at 11, and recording that
// as a rejection would teach the engine the wrong lesson. The cron still has
// the final say on anything the student never answers.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const { kind } = (await request.json().catch(() => ({}))) as { kind?: unknown };
  if (typeof kind !== 'string' || !kind || kind.length > 40) {
    return NextResponse.json({ error: 'kind required' }, { status: 400 });
  }

  const admin = createAdminClient();
  // Keyed on (student, kind, today) rather than a row id, so the GET no longer
  // has to insert-and-return before it can answer — that read-write round trip
  // sat in the critical path of the home screen's first card.
  //
  // Scoped to this student AND to still-open rows, so an ack can neither touch
  // someone else's log nor overwrite a verdict already reached.
  // Same IST-3am study-day boundary as the GET that showed the action
  // (next-action/route.ts). This was UTC midnight — 5:30am IST — so between
  // 3:00 and 5:30am a student's ack targeted rows the GET had already
  // excluded. One day definition, or the write and the read disagree.
  // studyDayStart — see the note in ../route.ts. A hardcoded 03:00 kept the
  // pre-14-Aug rollover after the study day moved to 05:30.
  const dayStart = studyDayStart();
  const { data, error } = await admin
    .from('study_action_log')
    .update({ outcome: 'followed', outcome_at: new Date().toISOString() })
    .eq('student_id', user.id).eq('kind', kind)
    .gte('shown_at', dayStart.toISOString()).is('outcome', null)
    .select('id');

  if (error) {
    console.error('[next-action/ack] failed', error.message);
    return NextResponse.json({ error: 'Could not save' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, updated: (data ?? []).length });
}
