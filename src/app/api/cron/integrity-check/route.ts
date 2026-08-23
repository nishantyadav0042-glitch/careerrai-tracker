import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { withCronTracking } from '@/lib/cron-run-tracker';
import { sendSecurityAlert } from '@/lib/alerting';

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
    ok: tier0.length === 0,
    checkedAt: new Date().toISOString(),
    invariantsChecked: rows.length,
    failing: failing.length,
    tier0Failing: tier0.length,
    violations: failing,
  };
  console.log('[integrity-check]', JSON.stringify({ ...result, violations: failing.length }));
  return NextResponse.json(result);
}

export { POST as GET };
