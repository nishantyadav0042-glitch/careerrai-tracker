import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { withCronTracking } from '@/lib/cron-run-tracker';

// The learning loop's observation half, daily.
//
// The rep records what they did and what the student said. THIS records what
// the student then actually did — read from daily_reports and video_sessions,
// never from a human. A rep cannot mark their own intervention successful, and
// that is the only reason the outcome columns are worth anything as evidence.
//
// All of the work is one set-based statement inside
// sweep_intervention_outcomes(). Deliberately NOT a TypeScript loop: doing
// this per-row would mean loading every intervention and every student's log
// history into a serverless function — the ~5k wall the architecture gate
// already recorded — to compute something Postgres answers in one pass.
//
// MATURITY IS THE INVARIANT: a window that has not elapsed stays NULL. Writing
// `false` into an unmeasurable window would not be a safe default, it would be
// a fabricated negative that permanently understates every recent
// intervention. Verified functionally against careerrai-test before this
// shipped: a 2-day-old intervention gets logged_d1 and leaves d3/d7 NULL.
//
// NOT ATTRIBUTION. `logged_d3` means "this student logged within three days of
// being contacted" — not that the contact caused it. The comparison that could
// support a stronger claim (reached vs unreached WITHIN the same lane) belongs
// to the founder view, and even there the word is ASSOCIATED, never CAUSED.

export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return withCronTracking('/api/cron/outcome-sweep', async () => {

    const admin = createAdminClient();

    const { data, error } = await admin.rpc('sweep_intervention_outcomes', { p_limit: 500 });
    if (error) {
      // A failed sweep must be loud. A ledger that silently stops being
      // measured still LOOKS complete — every row keeps its NULLs, and
      // "not yet measurable" is indistinguishable from "nobody measured".
      console.error('[outcome-sweep] rpc failed:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const row = Array.isArray(data) ? data[0] : data;
    const candidates = (row?.candidates as number | undefined) ?? 0;
    const measured = (row?.measured as number | undefined) ?? 0;

    // The cap is 500 per run. If we hit it there is more waiting, and saying so
    // is the difference between a backlog and a silent truncation that reads
    // as "everything is measured".
    return NextResponse.json({
      ok: true, candidates, measured, moreWaiting: candidates >= 500,
    });
  });
}
