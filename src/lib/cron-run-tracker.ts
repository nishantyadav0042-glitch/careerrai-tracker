import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

// ── Scheduler observability (Notification Reliability V2, Installment 3, ──
// Batch 4). 38 crons are declared in vercel.json; a GitHub Actions fallback
// duplicates 12 of them as an independent trigger path — decision-engine is
// one of the 12, which is exactly the dual-scheduler shape that produced
// Installment 1's proven duplicate-send bug. Before this file, "a cron ran
// and found nothing to do" and "a cron never fired at all" were the same
// blank space in the data — nothing recorded either fact anywhere.
//
// Wrap a cron's ENTIRE existing handler body in this; the row is written on
// entry (before the handler runs, so a hard-killed/timed-out invocation
// still leaves a row with completed_at=null — a REAL, distinguishable fact,
// not a guess) and updated with the handler's own JSON response body plus a
// duration on completion, or the real error on a throw.
export async function withCronTracking(
  path: string,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from('cron_runs')
    .insert({ cron_path: path })
    .select('id')
    .single();

  const startedAt = Date.now();
  try {
    const response = await handler();
    if (row?.id) {
      let result: unknown = null;
      try { result = await response.clone().json(); } catch { /* non-JSON response, fine — result stays null */ }
      await admin.from('cron_runs').update({
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
        result,
      }).eq('id', row.id);
    }
    return response;
  } catch (err) {
    if (row?.id) {
      await admin.from('cron_runs').update({
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
        fatal_error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      }).eq('id', row.id);
    }
    throw err;
  }
}
