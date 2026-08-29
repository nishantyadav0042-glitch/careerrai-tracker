import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { withCronTracking } from '@/lib/cron-run-tracker';
import { sendSecurityAlert } from '@/lib/alerting';
import { findSilentCrons, describeSilentCrons, type CronRunSummary } from '@/lib/cron-liveness';
import vercelConfig from '../../../../../vercel.json';

export const maxDuration = 60;

// Nightly business-capability reconciliation — 03:15 IST, just after the study
// day rolls over, so a full day's writes are settled before we check them.
//
// This is the difference between "we audited the data once" and "the data is
// audited". Every statement in business_invariants() must be true of raw
// persisted rows; a Tier-0 violation means the company's record of reality is
// wrong, and it alerts rather than waiting to be noticed on a dashboard.
//
// Deliberately dumb: it does not fix anything. Automatic repair of business
// data is how a small bug becomes a large one overnight.

interface Invariant {
  capability: string;
  tier: number;
  invariant: string;
  violations: number;
  severity: string;
}

export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Tracked so a failure is visible in cron_runs instead of silent.
  return withCronTracking('/api/cron/integrity-check', () => integrity_checkRun());
}

async function integrity_checkRun(): Promise<NextResponse> {

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('business_invariants');

  if (error) {
    // The check itself failing is its own incident: it means we are flying
    // blind, which is the state this job exists to prevent.
    await sendSecurityAlert(
      'Integrity check could not run',
      `business_invariants() failed: ${error.message}`
    ).catch(() => {});
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Invariant[];
  const failing = rows.filter((r) => r.violations > 0);
  const tier0 = failing.filter((r) => r.tier === 0);

  // ── Is the schedule itself alive? ────────────────────────────────────────
  //
  // The invariants above check that the DATA is right. This checks that the
  // jobs which produce and maintain it are running at all — a different
  // failure, and the one that actually happened: outcome-sweep (#55) and
  // purge-session-handoffs (#56) were both declared and had never executed
  // once, for days, in silence. Neither would have shown up as a bad row.
  //
  // Best-effort: a liveness check that cannot read cron_runs must not take
  // down the integrity check that can still read the invariants.
  let silentDetail = '';
  let silentCount = 0;
  try {
    const { data: runRows, error: runErr } = await admin
      .from('cron_runs')
      .select('cron_path, started_at')
      .gt('started_at', new Date(Date.now() - 30 * 86_400_000).toISOString());
    if (runErr) throw new Error(runErr.message);

    const latest = new Map<string, string>();
    for (const r of ((runRows ?? []) as { cron_path: string; started_at: string }[])) {
      const prev = latest.get(r.cron_path);
      if (!prev || r.started_at > prev) latest.set(r.cron_path, r.started_at);
    }
    const summaries: CronRunSummary[] = [...latest].map(([path, lastRunIso]) => ({ path, lastRunIso }));
    const declared = (vercelConfig as { crons?: { path: string; schedule: string }[] }).crons ?? [];
    const silent = findSilentCrons(declared, summaries, Date.now());
    silentCount = silent.length;
    if (silent.length > 0) {
      silentDetail = describeSilentCrons(silent);
      await sendSecurityAlert(
        `Scheduled jobs not running (${silent.length})`,
        `${silentDetail}\n\nA declared cron that is silent is invisible by nature: it looks identical to one whose work has not come due. Check the Vercel cron registration and the GitHub Actions fallback.`,
      ).catch((e) => console.error('[integrity] cron-liveness alert failed', e));
    }
  } catch (e) {
    console.error('[integrity] cron liveness check failed:', e instanceof Error ? e.message : String(e));
  }

  if (tier0.length > 0) {
    const detail = tier0
      .map((r) => `[${r.severity}] ${r.capability}: ${r.invariant} — ${r.violations} row(s)`)
      .join('\n');
    await sendSecurityAlert(
      `Tier-0 data integrity broken (${tier0.length})`,
      `${detail}\n\nThese are statements that must be true of raw rows. Something wrote data that cannot be correct.`
    ).catch((e) => console.error('[integrity] alert failed', e));
  }

  const result = {
    ok: tier0.length === 0 && silentCount === 0,
    checkedAt: new Date().toISOString(),
    invariantsChecked: rows.length,
    failing: failing.length,
    tier0Failing: tier0.length,
    silentCrons: silentCount,
    violations: failing,
  };
  console.log('[integrity-check]', JSON.stringify({ ...result, violations: failing.length }));
  return NextResponse.json(result);
}

export { POST as GET };
