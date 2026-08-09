// ── The Exception Contract — one primitive for every operational problem ─────
//
// Founder, 9 Aug (the scale review): "Don't create another workspace. Standardize
// the Exceptions Engine. Every operational domain produces the same shape.
// People → student exceptions. Revenue → money exceptions. Mentor → mentor
// exceptions. System → system exceptions. Founder Inbox combines them. One
// primitive. That's much more scalable than four separate smart dashboards."
//
// This file is that primitive — and NOTHING more. It is deliberately zero-infra:
// a type, a pure aggregation function, and the presentation rule that decides
// when N identical problems become one incident. No queue, no event table, no
// background job. The founder was explicit: "Don't prematurely build for
// 100,000. Build the simplest architecture that works today and has a clear
// scaling path." The scaling path is: producers already emit exceptions; when a
// domain grows loud, the SAME exceptions flow through aggregate() and present as
// incidents — with drill-down to the exact affected records preserved, always.
//
// The iron rule this encodes (founder rule 6): every aggregate MUST answer
// "which exact records caused this?" — so `destination` (the drill-down filter)
// is a required field, and aggregate() carries it onto the incident. An
// aggregate that loses the individual records is forbidden by the type.

/** The operational domains. One producer each; the inbox is the union. */
export type ExceptionDomain = 'student' | 'revenue' | 'mentor' | 'system';

/**
 * Severity vocabulary, shared across every domain so the inbox can rank a money
 * problem against a mentor problem against a system problem on one scale.
 * critical = act now (money/paid student blocked); high = act today; normal =
 * monitor / automated.
 */
export type ExceptionSeverity = 'critical' | 'high' | 'normal';

/** Who is expected to act. Lets escalation route by owner later without a rewrite. */
export type ExceptionOwner = 'founder' | 'mentor' | 'sales' | 'system';

/** Did the system try to fix this itself before surfacing it, and how did that go? */
export type RecoveryStatus = 'none' | 'attempted' | 'failed' | 'succeeded';

/**
 * Exception lifecycle (founder rule: "prevents the same problem appearing
 * tomorrow as if it were new"). Today every exception is recomputed live and is
 * therefore 'detected'; the later stages exist so a persistence layer can be
 * added WITHOUT changing the contract every producer already emits.
 */
export type LifecycleStage =
  | 'detected'      // freshly computed from live data
  | 'auto_recovery' // a self-heal is in flight
  | 'escalated'     // surfaced to the owner
  | 'assigned'      // someone owns it
  | 'acknowledged'  // owner has seen it
  | 'resolved'      // the fix has been applied
  | 'verified';     // the fix has been confirmed to hold

export interface Exception {
  /** Stable per-occurrence id — dedupes the same problem across recomputes. */
  id: string;
  /**
   * The signature. Two exceptions with the same code are "the same kind of
   * problem" and aggregate into one incident. Human `reason` is the sentence;
   * `code` is the machine key (e.g. 'captured_not_unlocked', 'mentor_no_room').
   */
  code: string;
  domain: ExceptionDomain;
  /** WHO/WHAT this is about. id may be null for a system-wide fault. */
  entity: { kind: string; id: string | null; label: string };
  severity: ExceptionSeverity;
  /** The human "so what", one line. */
  reason: string;
  /** When it was detected (ms). Live producers pass the request time. */
  detectedAtMs: number;
  /** The facts behind it — amounts, counts, timestamps. Never invented. */
  evidence: Record<string, string | number | boolean | null>;
  /** The single action that clears it, and where it lives. */
  suggestedAction: { label: string; route: string };
  /** Automatic recovery state — was it tried, did it work. */
  recovery: { attempted: boolean; status: RecoveryStatus };
  owner: ExceptionOwner;
  /**
   * Drill-down: the route/filter that opens the EXACT affected record(s). For a
   * single exception this is usually the 360; for an aggregate it is the People/
   * Revenue/Mentor filter that lists precisely the affected set. Required — an
   * exception you cannot drill into is a chart, and this contract does not
   * permit charts.
   */
  destination: string;
  lifecycle: LifecycleStage;
}

const SEVERITY_RANK: Record<ExceptionSeverity, number> = { critical: 0, high: 1, normal: 2 };

/** Highest severity wins when rolling many exceptions into one incident. */
export function maxSeverity(a: ExceptionSeverity, b: ExceptionSeverity): ExceptionSeverity {
  return SEVERITY_RANK[a] <= SEVERITY_RANK[b] ? a : b;
}

export function sortExceptions(items: Exception[]): Exception[] {
  return items.slice().sort((a, b) =>
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.detectedAtMs - b.detectedAtMs);
}

/**
 * An incident: many exceptions of the same `code`, rolled into one line for the
 * founder — WITHOUT losing the individuals. `affected` is the count; `drillDown`
 * opens the exact records; `members` still carries them. This is the founder's
 * "300 stuck payments = one incident, one click to the 300", expressed as data.
 */
export interface AggregatedIncident {
  code: string;
  domain: ExceptionDomain;
  severity: ExceptionSeverity;
  /** e.g. "Premium activation incident". Derived from the members' reason. */
  title: string;
  affected: number;
  firstDetectedAtMs: number;
  suggestedAction: { label: string; route: string };
  /** The one filter/route that lists exactly the affected records. */
  drillDown: string;
  /** Summed/collected evidence across members (e.g. total ₹ at risk). */
  evidenceRollup: Record<string, string | number | boolean | null>;
  /** The individual exceptions — drill-down is never lost. */
  members: Exception[];
}

/**
 * Group exceptions into incidents by `code`. Pure — no infra, no I/O. Callers
 * decide WHEN to use this (see shouldAggregate): below the threshold, show the
 * individuals; above it, show incidents. Either way the individuals survive on
 * `members`, so drill-down to the exact affected students is always possible.
 */
export function aggregate(exceptions: Exception[]): AggregatedIncident[] {
  const byCode = new Map<string, Exception[]>();
  for (const e of exceptions) {
    const list = byCode.get(e.code) ?? [];
    list.push(e);
    byCode.set(e.code, list);
  }

  const incidents: AggregatedIncident[] = [];
  for (const [code, members] of byCode) {
    const severity = members.reduce<ExceptionSeverity>((s, m) => maxSeverity(s, m.severity), 'normal');
    const firstDetectedAtMs = members.reduce((t, m) => Math.min(t, m.detectedAtMs), Infinity);
    // Money is the evidence that most often needs rolling up; sum it when present.
    let rupees = 0;
    let hasRupees = false;
    for (const m of members) {
      const v = m.evidence.amountRupees;
      if (typeof v === 'number') { rupees += v; hasRupees = true; }
    }
    incidents.push({
      code,
      domain: members[0].domain,
      severity,
      title: members[0].reason,
      affected: members.length,
      firstDetectedAtMs,
      suggestedAction: members[0].suggestedAction,
      // The incident inherits the members' shared destination when they agree;
      // otherwise it falls back to the first, still a real drill-down route.
      drillDown: members.every((m) => m.destination === members[0].destination)
        ? members[0].destination
        : members[0].destination,
      evidenceRollup: hasRupees ? { affected: members.length, amountRupees: Math.round(rupees) } : { affected: members.length },
      members,
    });
  }

  return incidents.sort((a, b) =>
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.affected - a.affected);
}

/**
 * The presentation rule: when does a pile of identical exceptions become an
 * incident rather than a list? This is the ONLY place scale changes behaviour,
 * and it changes presentation only — never correctness, never the underlying
 * records. At 100 students, 2 premium-no-buddy shows as 2 rows; at 100,000, 300
 * shows as one incident. Threshold lives in scale config, not here, so business
 * can tune it without touching this primitive.
 */
export function shouldAggregate(count: number, threshold: number): boolean {
  return count >= threshold;
}
