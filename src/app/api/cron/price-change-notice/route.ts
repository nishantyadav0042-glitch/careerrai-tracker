import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { withCronTracking } from '@/lib/cron-run-tracker';
import { runPriceChangeNotice, PRICE_NOTICE_DAILY_CAP } from '@/lib/price-change-notice';

export const maxDuration = 300;

// ── Telling every student the price changed, a day at a time ────────────────
//
// Founder, 22 Sep 2026: "Also share the same with all students" and "only send
// notification for pricing day wise...not all pricing at once."
//
// Runs at 11:30 IST (06:00 UTC) — late enough that a student is awake, early
// enough that it is not competing with the evening study nudge.
//
// It is SAFE TO RUN FOREVER. Once every real student has been told about this
// revision the batch comes back empty and the run reports complete:true
// without sending anything, so nothing has to remember to switch it off. The
// day the price changes again, PRICE_REVISION_KEY changes with it and the same
// cron starts a fresh rollout.
//
// GET ?dry=1 selects the batch and sends nothing. Look at that first.
// GET ?cap=N overrides the daily cap for one run — use it to slow a rollout
// down, or to send a single test notification to the front of the queue.
//
// Vercel Cron invokes with GET (Incidents #55/#56).

export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const dryRun = params.get('dry') === '1';

  // A malformed ?cap must not silently become the full daily cap — that is the
  // difference between a two-student test and 200 real notifications.
  const capRaw = params.get('cap');
  let cap = PRICE_NOTICE_DAILY_CAP;
  if (capRaw !== null) {
    const n = Number(capRaw);
    if (!Number.isInteger(n) || n < 0) {
      return NextResponse.json({ error: `cap must be a non-negative integer, got ${capRaw}` }, { status: 400 });
    }
    cap = n;
  }

  return withCronTracking('/api/cron/price-change-notice', async () => {
    const result = await runPriceChangeNotice(createAdminClient() as never, { dryRun, cap });
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  });
}

export { POST as GET };
