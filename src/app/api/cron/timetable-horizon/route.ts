import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { sendNotification } from '@/lib/notifications';
import { horizonDaysLeft, HORIZON_NUDGE_DAYS } from '@/lib/timetable-align';
import type { TimetableBlock } from '@/lib/timetable';

export const dynamic = 'force-dynamic';

// "Upload your next timetable" — the reminder the 3-week ingest window makes
// necessary. Founder, 7 Aug: "if you are maximum updating two weeks only, set
// a reminder to students to upload their next timetable as well."
//
// A dated timetable has a last day. From HORIZON_NUDGE_DAYS before that day
// until it passes, the student gets ONE push (not one per day — the marker
// row dedupes) saying their plan runs out and the next sheet keeps them
// aligned. Recurring weekly timetables never expire and never match here.
//
// Morning IST, so the reminder lands while the coaching's next sheet is easy
// to ask for — not at midnight when nothing can be done about it.
export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: rows, error } = await admin
    .from('student_timetables')
    .select('student_id, blocks, confirmed_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let nudged = 0;
  for (const row of rows ?? []) {
    const blocks = (row.blocks as TimetableBlock[] | null) ?? [];
    const daysLeft = horizonDaysLeft(blocks, today);
    // null = undated (never expires); too-far = not yet; long-gone = the
    // student has moved on and a nag about a stale sheet helps nobody.
    if (daysLeft == null || daysLeft > HORIZON_NUDGE_DAYS) continue;
    const horizonPassedDaysAgo = daysLeft === 0;
    if (horizonPassedDaysAgo && row.confirmed_at && Date.parse(String(row.confirmed_at)) < Date.now() - 14 * 86_400_000) continue;

    // Once per horizon: skip if this student was already nudged in the last 10
    // days — the window is ~3 weeks, so one horizon gets exactly one push.
    const { data: recent } = await admin
      .from('notifications')
      .select('id')
      .eq('user_id', row.student_id)
      .eq('type', 'timetable_refresh')
      .gte('created_at', new Date(Date.now() - 10 * 86_400_000).toISOString())
      .limit(1);
    if (recent && recent.length > 0) continue;

    await sendNotification({
      userId: row.student_id as string,
      type: 'timetable_refresh',
      title: daysLeft === 0 ? 'Your timetable has run out' : `Your timetable ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
      body: 'Upload your coaching’s next sheet and your daily plan stays matched to your classes.',
      channels: ['in_app', 'push'],
      data: { url: '/student/tracker' },
    }).catch((e) => console.error('[timetable-horizon] notify failed', row.student_id, String(e)));
    nudged++;
  }

  return NextResponse.json({ ok: true, examined: rows?.length ?? 0, nudged });
}

export { POST as GET };
