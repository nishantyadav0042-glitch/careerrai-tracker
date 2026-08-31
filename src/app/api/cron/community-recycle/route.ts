import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { withCronTracking } from '@/lib/cron-run-tracker';
import { promoteDailyPick } from '@/lib/daily-pick-runner';

export const maxDuration = 60;

// Daily at 02:00 UTC (07:30 IST) — before the 8am study day begins, so the
// shelf is stocked by the time the first student opens Daily Pick.
//
// Closes every expired voting window (a finished ballot turn — no grading,
// no bars), refills the shelf from the archive if it fell below the minimum,
// then stamps today's Top Pick. Idempotent: a double-run is a no-op.

export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Tracked so a failure is visible in cron_runs instead of silent.
  return withCronTracking('/api/cron/community-recycle', () => community_recycleRun());
}

async function community_recycleRun(): Promise<NextResponse> {
  const admin = createAdminClient();
  try {
    // The ballot recycle retired 20 Aug — there is no resting pool to revive
    // any more, every live item is always eligible. What remains is the part
    // that matches the founder's rule: exactly one winner per kind per day.
    // Idempotent — a second run today changes nothing.
    const pick = await promoteDailyPick(admin);
    console.log('[daily-pick]', JSON.stringify({ pick }));
    // Tips only since 31 Aug, so only the tip runway can be short. Visible,
    // not silent: "at least one month" is a real requirement and this is the
    // only place that knows whether it currently holds.
    if (pick.shortfall.tip > 0) {
      console.warn('[daily-pick] hint runway under a month —',
        `${pick.runway.tip} never-featured tips left (need ${pick.shortfall.tip} more).`,
        pick.runway.tip === 0
          ? 'Shelf is dry: students are now seeing REPEATS of old hints.'
          : '');
    }
    return NextResponse.json({ ok: true, pick });
  } catch (e) {
    console.error('[community-recycle] failed', e);
    return NextResponse.json({ error: 'Recycle failed' }, { status: 500 });
  }
}

// GET for manual runs from the admin desk / a browser check.
export const GET = POST;
