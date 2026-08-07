import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { recycleCommunityPool } from '@/lib/community-recycle';
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
  const admin = createAdminClient();
  try {
    const result = await recycleCommunityPool(admin);
    // Then fill today's top slot. Order matters: recycle first so a revived
    // item is eligible for today, then promote exactly one winner per kind.
    // Idempotent — a second run today changes nothing.
    const pick = await promoteDailyPick(admin);
    console.log('[community-recycle]', JSON.stringify({ ...result, pick }));
    if (pick.shortfall.question > 0 || pick.shortfall.tip > 0) {
      // Visible, not silent: "at least one month" is a real requirement and
      // this is the only place that knows whether it currently holds.
      console.warn('[daily-pick] runway under a month —',
        `questions ${pick.runway.question}d (need ${pick.shortfall.question} more),`,
        `tips ${pick.runway.tip}d (need ${pick.shortfall.tip} more)`);
    }
    return NextResponse.json({ ok: true, ...result, pick });
  } catch (e) {
    console.error('[community-recycle] failed', e);
    return NextResponse.json({ error: 'Recycle failed' }, { status: 500 });
  }
}

// GET for manual runs from the admin desk / a browser check.
export const GET = POST;
