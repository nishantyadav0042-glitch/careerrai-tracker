import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { withCronTracking } from '@/lib/cron-run-tracker';
import { runRetentionSweep } from '@/lib/telemetry-retention';

export const maxDuration = 300;

// ── The database stops eating itself ────────────────────────────────────────
//
// Founder, 7 Sep 2026: "measure the growth rate and build the retention sweep."
//
// Measured: 379 MB of a 500 MB free-tier ceiling, growing ~15 MB a day, which
// is roughly eight days from students being unable to log study. Half of all
// telemetry is one event (`tap`) that nothing in the repo reads.
//
// Runs at 03:20 IST (21:50 UTC), the quietest hour. The rules and the reasoning
// live in lib/telemetry-retention.ts; the rails that make a bad call harmless
// live in the database (migration 20260908a) — two tables only, an explicit
// event list required for student_events, and a cutoff at least a week old.
//
// GET ?dry=1 counts and deletes nothing. Always look at that first.
//
// Vercel Cron invokes with GET (Incidents #55/#56).

export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const dryRun = new URL(request.url).searchParams.get('dry') === '1';
  return withCronTracking('/api/cron/telemetry-retention', async () => {
    const result = await runRetentionSweep(createAdminClient() as never, { dryRun });
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  });
}

export { POST as GET };
