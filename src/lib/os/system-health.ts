import { findSacredFailures } from './sacred-guard';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = any;

// ── System Health — broken things surface, a healthy machine disappears ──────
//
// Founder, 9 Aug: "Healthy things disappear. Broken things surface." Applied to
// the machine itself. People/Revenue/Mentor watch the humans; this watches the
// system that serves them. A green board that says "all systems operational" is
// engineering admiring itself — so this shows NOTHING when nothing is broken.
//
// Two honest sources, no invented signal:
//   1. business_invariants — the database's own contract self-test. Every
//      capability (payment, push, streak, mentorship…) has tier-ranked
//      invariants; a row with violations > 0 is a live breach. Tier 0 is
//      load-bearing, so tier-0 breaches are critical.
//   2. The sacred guard — the proven live incident class: money captured but
//      premium never granted, a paid student past SLA with no mentor. These are
//      the exact machine failures that have actually happened in this data.
//
// What is NOT here, on purpose: cron freshness. No cron records its runs to a
// table today, so "cron X last ran 3h ago" cannot be shown honestly — a
// confident wrong number is worse than a gap. When a cron heartbeat exists, it
// belongs here; until then it stays out.

export type HealthSeverity = 'critical' | 'high' | 'normal';

export interface HealthItem {
  id: string;
  /** What is broken, as a statement. */
  title: string;
  /** The "so what" — one line. */
  detail: string;
  count: number;
  severity: HealthSeverity;
  /** Where you go to fix or inspect it. */
  route: string;
  source: 'invariant' | 'sacred' | 'engine';
}

export interface SystemHealth {
  /** Only what is broken. Empty means the machine is healthy. */
  items: HealthItem[];
  /** How many invariants were actually evaluated — the assurance behind "clear". */
  invariantsChecked: number;
  allClear: boolean;
  checkedAtMs: number;
}

interface InvariantRow {
  capability: string;
  tier: number;
  invariant: string;
  violations: number;
  severity?: string;
}

/** Tier 0 is load-bearing → critical; tier 1 → high; deeper tiers → normal. */
function severityForTier(tier: number): HealthSeverity {
  if (tier <= 0) return 'critical';
  if (tier === 1) return 'high';
  return 'normal';
}

const RANK: Record<HealthSeverity, number> = { critical: 0, high: 1, normal: 2 };

export async function assembleSystemHealth(admin: Admin, nowMs: number): Promise<SystemHealth> {
  const items: HealthItem[] = [];

  // ── 1. The machine's own contract self-test ────────────────────────────────
  // If the engine itself cannot run, that is the most critical health fact
  // there is — a silent-green board would be lying. Surface it as an item.
  let invariantsChecked = 0;
  const { data: inv, error } = await admin.rpc('business_invariants');
  if (error) {
    items.push({
      id: 'engine:down',
      title: 'The integrity engine is not running',
      detail: `business_invariants failed to execute (${error.message ?? 'unknown error'}). No contract can be checked until this is fixed — the whole board is blind.`,
      count: 1,
      severity: 'critical',
      route: '/admin/health',
      source: 'engine',
    });
  } else {
    const rows = (inv ?? []) as InvariantRow[];
    invariantsChecked = rows.length;
    for (const r of rows) {
      if ((r.violations ?? 0) <= 0) continue;
      items.push({
        id: `inv:${r.capability}:${r.invariant}`,
        title: `${r.capability}: ${r.invariant}`,
        detail: `${r.violations} row${r.violations === 1 ? '' : 's'} breach this invariant. A tier-${r.tier} contract is failing — the capability is not behaving as guaranteed.`,
        count: r.violations,
        severity: severityForTier(r.tier),
        route: '/admin/health',
        source: 'invariant',
      });
    }
  }

  // ── 2. The proven live-incident class ──────────────────────────────────────
  // Sacred faults are machine failures (webhook/activation broke, SLA lapsed),
  // so they belong on the health board as well as on Revenue/People — a broken
  // thing the founder must be unable to miss shows in every place it is true.
  const sacred = await findSacredFailures(admin, nowMs);
  for (const a of sacred) {
    items.push({
      id: `sacred:${a.id}`,
      title: a.title,
      detail: a.rootCause,
      count: 1,
      severity: a.severity === 'critical' ? 'critical' : 'high',
      route: a.actionRoute,
      source: 'sacred',
    });
  }

  items.sort((a, b) => RANK[a.severity] - RANK[b.severity] || b.count - a.count);

  return {
    items,
    invariantsChecked,
    allClear: items.length === 0,
    checkedAtMs: nowMs,
  };
}
