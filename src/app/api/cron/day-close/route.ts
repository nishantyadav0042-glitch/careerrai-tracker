import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { withCronTracking } from '@/lib/cron-run-tracker';
import { closeDay } from '@/lib/sales-opportunity-record';

export const maxDuration = 120;

// ── The day closes itself ───────────────────────────────────────────────────
//
// Founder, 3 Sep 2026: "make sure they mark every list close or something,
// otherwise it doesn't make sense of these lists."
//
// This is the second half of that. A counsellor can now mark every card —
// worked, or skipped with a reason — but a card nobody touches still has to
// end up somewhere, or the day never closes and the record stays ambiguous
// forever. On 3 Sep, 240 of the 241 cards ever dealt were in exactly that
// state, going back to 30 August.
//
// So after the shift (15:00–21:00 IST) every card still open from a day that
// has ENDED is stamped `not_marked`. That is not a punishment and not a
// metric of a person — it is the difference between "we don't know" and "we
// know nobody got to these forty students", and only the second one can be
// acted on.
//
// Runs at 21:45 IST (16:15 UTC), 45 minutes after the shift ends. Sweeps every
// past day rather than only yesterday, so a missed run repairs itself on the
// next one instead of leaving a permanent hole. Idempotent by construction:
// it only ever touches rows where closed_at IS NULL.
//
// Vercel Cron invokes with GET (Incidents #55/#56).

export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return withCronTracking('/api/cron/day-close', async () => {
    const result = await closeDay(createAdminClient());
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  });
}

export { POST as GET };
