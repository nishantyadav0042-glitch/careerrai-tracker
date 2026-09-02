import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { withCronTracking } from '@/lib/cron-run-tracker';
import { runLeadIntake } from '@/lib/lead-intake';

export const maxDuration = 300;

// The daily lead intake — see lib/lead-intake.ts for the whole rule.
//
// Scheduled at 09:00 UTC (14:30 IST), half an hour before both part-time
// seats start their 15:00–21:00 window, so the day's new students are in the
// book when the counsellors sit down. Idempotent by construction: a second run
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
