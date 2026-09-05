import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { withCronTracking } from '@/lib/cron-run-tracker';
import { liveStreak } from '@/lib/streak-utils';

// Sales-ready trigger (§D), daily. The hottest signal (buddy-CTA click) flags
// sales_ready instantly in /api/engagement; this catches the slower criteria:
//   • streak_days >= 3, OR
//   • mock_opened AND first_log_at set, OR
//   • day-5 fallback: a free user 5+ days in who hasn't been flagged yet.
// Only flags FREE students (premium users have already converted).
const MS_PER_DAY = 86_400_000;

export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return withCronTracking('/api/cron/sales-ready', async () => {

    const admin = createAdminClient();
    const now = Date.now();
    const fiveDaysAgo = new Date(now - 5 * MS_PER_DAY).toISOString();

    // Candidates: engagement rows not yet sales-ready.
    const { data: rows, error } = await admin
      .from('student_engagement')
      .select('student_id, first_log_at, mock_opened, signed_up_at')
      .eq('sales_ready', false)
      .limit(500);
    if (error) {
      console.error('[sales-ready]', error);
      return NextResponse.json({ error: 'query failed' }, { status: 500 });
    }
    if (!rows?.length) return NextResponse.json({ flagged: 0 });

    const ids = rows.map((r) => r.student_id);

    // Only free students qualify (premium have converted).
    const { data: profs } = await admin
      .from('profiles')
      .select('id, is_premium, role')
      .in('id', ids);
    const freeIds = new Set(
      (profs ?? []).filter((p) => p.role === 'student' && !p.is_premium).map((p) => p.id)
    );

    // Streak lookup for the streak>=3 criterion. last_log_date comes along
    // because current_streak alone is a LIE for this purpose: the column is
    // written at log time and never decays, so a student who logged three days
    // running and then vanished for a fortnight still reads as streak=3 and
    // would be flagged sales-ready on the strength of engagement that stopped.
    const { data: streaks } = await admin
      .from('streak_data')
      .select('student_id, current_streak, last_log_date')
      .in('student_id', ids);
    const streakById = new Map((streaks ?? []).map((s) =>
      [s.student_id, liveStreak(s.current_streak as number | null, s.last_log_date as string | null)]));

    const toFlag: string[] = [];
    for (const r of rows) {
      if (!freeIds.has(r.student_id)) continue;
      const streak = streakById.get(r.student_id) ?? 0;
      const mockSignal = r.mock_opened && !!r.first_log_at;
      const dayFive = !!r.signed_up_at && r.signed_up_at <= fiveDaysAgo;
      if (streak >= 3 || mockSignal || dayFive) toFlag.push(r.student_id);
    }

    if (toFlag.length) {
      await admin
        .from('student_engagement')
        .update({ sales_ready: true, sales_ready_at: new Date(now).toISOString() })
        .in('student_id', toFlag)
        .eq('sales_ready', false);
    }

    return NextResponse.json({ flagged: toFlag.length });
  });
}

export { POST as GET };
