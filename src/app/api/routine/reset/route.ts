import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getLogDateString } from '@/lib/streak-utils';

export const dynamic = 'force-dynamic';

// Reset today's plan (founder S3, 10 Aug: "just add study plan reset button").
//
// Wipes TODAY only — the routine row and today's tick marks — so the next
// /api/routine/today call rebuilds a fresh day from the student's current
// hours, coverage and timetable. Nothing historical is touched: past logs,
// streaks, coverage and the finish date all stand. This is "rebuild my day",
// not "erase my prep".
export async function POST() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });

  const admin = createAdminClient();
  const today = getLogDateString();

  await admin.from('routine_task_completions')
    .delete().eq('student_id', user.id).eq('routine_date', today);
  const { error } = await admin.from('daily_routines')
    .delete().eq('student_id', user.id).eq('routine_date', today);
  if (error) return NextResponse.json({ error: 'Could not reset — try again.' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
