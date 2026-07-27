import { NextResponse } from 'next/server';
import { requireAdminCtx } from '@/lib/require-admin';
import { studyDayString } from '@/lib/study-day';

export const maxDuration = 60;

// The morning screen.
//
// It leads with THE question — how many students came to study today, and how
// many completed today's log — because every capability, invariant, registry
// and dashboard below it exists to protect that one journey. A capability
// health board that does not show the outcome it protects is engineering
// admiring itself.
//
// Capabilities are never reported as "clean". A capability that passes today
// passes ALL KNOWN INVARIANTS today; tomorrow's feature can introduce a
// failure mode no invariant knows about yet. The wording is deliberate.

const OWNED = new Set([
  'Student identity', 'Push subscription', 'Notification delivery',
  'Study log', 'Streak', 'Payment', 'Subscription', 'Onboarding',
  'Daily plan', 'Mentorship', 'Peer learning',
]);

// Capabilities that exist in the product and have NO invariant contract. Named
// explicitly, because a capability nobody has named is one nobody tests. These
// are the 47 files the coverage audit found matching no feature.
const UNOWNED = [
  { capability: 'Referral',          why: 'No table, no events, no contract' },
  { capability: 'Swap / Repeat',     why: 'Writes daily_routines.swapped_out; no invariant' },
  { capability: 'Account deletion',  why: 'Deletes across 20+ tables; no reconciliation' },
  { capability: 'Calendar & meetings', why: '4 routes writing video_sessions; no contract' },
  { capability: 'CRM (Expedify)',    why: 'Inbound vendor webhook writes student_crm; no contract' },
];

interface InvariantRow {
  capability: string; tier: number; invariant: string;
  violations: number; severity: string;
}

export async function GET() {
  const ctx = await requireAdminCtx();
  if ('error' in ctx) return ctx.error;
  const { admin } = ctx;

  const today = studyDayString();
  const startedAt = Date.now();

  const [{ data: inv, error }, { data: opens }, { data: logs }, { data: students }] = await Promise.all([
    admin.rpc('business_invariants'),
    admin.from('student_events').select('user_id')
      .eq('event', 'app_open').gte('created_at', `${today}T00:00:00+05:30`),
    admin.from('daily_reports').select('student_id').eq('report_date', today),
    admin.from('profiles').select('id, is_test_account').eq('role', 'student'),
  ]);
  const runtimeMs = Date.now() - startedAt;

  if (error) {
    return NextResponse.json({ ok: false, error: 'invariants failed', detail: error.message }, { status: 500 });
  }

  const real = new Set((students ?? []).filter((s) => !s.is_test_account).map((s) => s.id));
  const openedToday = new Set((opens ?? []).map((o) => o.user_id as string).filter((id) => real.has(id))).size;
  const loggedToday = new Set((logs ?? []).map((l) => l.student_id as string).filter((id) => real.has(id))).size;

  const rows = (inv ?? []) as InvariantRow[];
  const byCapability = new Map<string, { tier: number; checks: number; failing: InvariantRow[] }>();
  for (const r of rows) {
    const c = byCapability.get(r.capability) ?? { tier: r.tier, checks: 0, failing: [] };
    c.checks += 1;
    if (r.violations > 0) c.failing.push(r);
    byCapability.set(r.capability, c);
  }

  const capabilities = [...byCapability.entries()].map(([capability, c]) => ({
    capability,
    tier: c.tier,
    checks: c.checks,
    failing: c.failing.length,
    // Never "healthy" or "clean" — only what we can actually assert.
    status: c.failing.length === 0 ? 'passes_known_invariants' : 'violated',
    worst: c.failing.length > 0
      ? c.failing.reduce((a, b) => (a.severity === 'critical' ? a : b)).severity
      : null,
    violations: c.failing,
  })).sort((a, b) => a.tier - b.tier || a.capability.localeCompare(b.capability));

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    studyDay: today,

    // ── THE KPI ──────────────────────────────────────────────────────────
    // First in the payload because it is first in importance. Everything
    // below exists to protect this.
    theOneKpi: {
      question: 'How many students came to study today, and how many completed today\'s log?',
      studentsTotal: real.size,
      openedToday,
      loggedToday,
      openToLogPct: openedToday > 0 ? Math.round((loggedToday / openedToday) * 100) : null,
      loggedOfAllPct: real.size > 0 ? Math.round((loggedToday / real.size) * 100) : null,
    },

    integrity: {
      invariantsChecked: rows.length,
      failing: rows.filter((r) => r.violations > 0).length,
      tier0Failing: rows.filter((r) => r.tier === 0 && r.violations > 0).length,
      runtimeMs,
      // Honest wording, enforced in the payload so no UI can soften it.
      claim: 'Currently passes all known invariants. Not "clean" — tomorrow\'s feature can introduce a failure mode no invariant knows about yet.',
    },

    capabilities,
    unowned: UNOWNED.filter((u) => !OWNED.has(u.capability)),
  });
}
