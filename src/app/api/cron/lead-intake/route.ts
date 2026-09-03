import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { withCronTracking } from '@/lib/cron-run-tracker';
import { runLeadIntake } from '@/lib/lead-intake';

export const maxDuration = 300;

// The daily lead intake — see lib/lead-intake.ts for the whole rule.
//
// Scheduled at 22:30 UTC (04:00 IST) — founder, 2 Sep: the day is dealt from
// 4 AM, when the previous Indian day is complete, so the list a counsellor
// opens at 3 PM is the one that was settled before anyone woke. Idempotent by construction: a second run
// in the same day finds the fuse spent and the pool already owned, and writes
// nothing. Vercel Cron invokes with GET (Incidents #55/#56).

export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return withCronTracking('/api/cron/lead-intake', async () => {
    const run = await runLeadIntake(createAdminClient(), { trigger: 'cron', actorId: null });
    return NextResponse.json(run, { status: run.state === 'SOURCE_UNAVAILABLE' ? 503 : run.state === 'PARTIAL' ? 500 : 200 });
  });
}

export { POST as GET };
