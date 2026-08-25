import { loadStaffDirectory, type StaffDirectory } from '@/lib/sales-authz';
import { bucketFor, listOpenFollowups } from '@/lib/sales-followup';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── The Founder Control Tower read model ────────────────────────────────────
//
// A read model, and nothing else. It computes no business rule of its own: it
// projects lead_outreach, sales_activity, sales_followup and student_payments
// and labels every number with where it came from and how much it can be
// trusted. The moment this file starts DECIDING something, there are two
// authorities for that fact.
//
// The rule the founder set, encoded as a type: a metric is never a bare number.
// It is a number plus its evidence class, so a renderer physically cannot show
// "0 calls" when what it means is "the CRM has no call records".

export type Evidence =
  /** An independent system recorded it: a payment, a push receipt, a product event. */
  | 'observed'
  /** A human typed it into the CRM. Useful, operational, and not proof. */
  | 'self_reported'
  /** The feature was never built, so there is no data and never will be for this window. */
  | 'not_instrumented'
  /** We tried to read it and could not. NOT zero. */
  | 'unavailable';

export interface Metric {
  label: string;
  value: number | null;
  evidence: Evidence;
  /** Shown under the number so the founder can re-derive it by hand. */
  source: string;
  /** Optional: what a non-zero value should make him do. */
  hint?: string;
}

export function metric(label: string, value: number | null, evidence: Evidence, source: string, hint?: string): Metric {
  // An unreadable value is ALWAYS 'unavailable', whatever the caller claimed.
  return { label, value, evidence: value === null && evidence !== 'not_instrumented' ? 'unavailable' : evidence, source, hint };
}

/** How a metric must be rendered. The one place the zero-rule lives. */
export function renderMetric(m: Metric): string {
  if (m.evidence === 'not_instrumented') return 'NOT AVAILABLE — DATA NOT INSTRUMENTED';
  if (m.value === null) return 'NOT AVAILABLE — DATA QUALITY FAILURE';
  return String(m.value);
}

/**
 * Whether an all-zero sales picture means "quiet day" or "nobody is using the
 * CRM". The system cannot observe calls, so it must not claim the first.
 */
export function crmInUse(activityCount: number | null, leadCount: number | null): boolean | null {
  if (activityCount === null || leadCount === null) return null;
  return activityCount > 0 || leadCount > 0;
}

export interface RepRow {
  id: string;
  name: string;
  /** Self-reported unless a vendor confirmed it — kept apart, never summed. */
  leadsOwned: number;
  contactedSelfReported: number;
  callsVendorConfirmed: number;
  followupsDue: number;
  followupsOverdue: number;
  interested: number;
  /** OBSERVED: a paid ledger row for a student this rep owns. */
  paidObserved: number;
  revenueObservedPaise: number;
  lastActivityAt: string | null;
  /** How this person is employed. A LABEL on the row, never a sort key and
   *  never a modifier applied to their numbers — a part-time rep's 8 calls
   *  are 8 calls. NULL when no capacity row exists (NOT CONFIGURED), which is
   *  a setup gap and must not render as "full-time by default". */
  employmentType: 'full_time' | 'part_time' | null;
}

export interface TowerData {
  crmInUse: boolean | null;
  today: Metric[];
  pipeline: Metric[];
  reps: RepRow[] | null;
  staff: StaffDirectory | null;
  followupCounts: { overdue: number; today: number; upcoming: number } | null;
  /** Rows the founder can act on right now. */
  unassignedCount: number | null;
  staleCount: number | null;
  unmatchedVendorCount: number | null;
  /** True when a per-rep conversion rate would be statistically indefensible. */
  conversionRateSuppressed: boolean;
  paidTotal: number | null;
}

async function safeCount(admin: any, table: string, build: (q: any) => any): Promise<number | null> {
  try {
    const { count, error } = await build(admin.from(table).select('*', { count: 'exact', head: true }));
    if (error) { console.error(`[tower] ${table} count failed:`, error.message); return null; }
    return count ?? 0;
  } catch (e) { console.error(`[tower] ${table} count threw:`, e); return null; }
}

/** Fewer than this many paid customers and a per-rep rate is noise, not signal. */
const MIN_PAID_FOR_RATES = 30;

export async function buildTower(admin: any): Promise<TowerData> {
  const now = Date.now();
  const istToday = new Date(now + 5.5 * 3600_000).toISOString().slice(0, 10);
  const dayStart = new Date(`${istToday}T00:00:00+05:30`).toISOString();
  const staleCutoff = new Date(now - 14 * 86_400_000).toISOString();

  const [
    staff, newLeadsToday, totalLeads, unassigned, stale, activityToday, activityTotal,
    unmatched, paidTotal, openFollowups,
  ] = await Promise.all([
    loadStaffDirectory(admin),
    safeCount(admin, 'profiles', (q) => q.eq('role', 'student').not('is_test_account', 'is', true).gte('created_at', dayStart)),
    safeCount(admin, 'lead_outreach', (q) => q),
    safeCount(admin, 'lead_outreach', (q) => q.is('owner_id', null)),
    safeCount(admin, 'lead_outreach', (q) => q.not('owner_id', 'is', null).lt('updated_at', staleCutoff)
      .not('status', 'in', '("converted","not_interested")')),
    safeCount(admin, 'sales_activity', (q) => q.gte('created_at', dayStart)),
    safeCount(admin, 'sales_activity', (q) => q),
    safeCount(admin, 'expedify_events', (q) => q.eq('resolution', 'unmatched')),
    safeCount(admin, 'student_payments', (q) => q.eq('status', 'paid')),
    listOpenFollowups(admin, { limit: 2000 }),
  ]);

  const followupCounts = openFollowups === null ? null : (() => {
    const c = { overdue: 0, today: 0, upcoming: 0 };
    for (const f of openFollowups) c[bucketFor(f.dueAt, now)]++;
    return c;
  })();

  // ── Per-rep, with self-reported and observed kept in separate columns ─────
  let reps: RepRow[] | null = null;
  try {
    const { data: staffRows, error: staffErr } = await admin
      .from('profiles').select('id, full_name, email, role').in('role', ['sales', 'admin']);
    if (staffErr) throw new Error(staffErr.message);

    const [{ data: leads }, { data: acts }, { data: paidRows }, { data: cfgRows }] = await Promise.all([
      admin.from('lead_outreach').select('student_id, owner_id, status, updated_at').not('owner_id', 'is', null),
      admin.from('sales_activity').select('actor_id, student_id, provenance, external_ref, created_at, status'),
      admin.from('student_payments').select('student_id, amount').eq('status', 'paid'),
      admin.from('sales_rep_config').select('rep_id, employment_type'),
    ]);
    const employmentById = new Map<string, 'full_time' | 'part_time'>(
      ((cfgRows ?? []) as any[]).map((c) => [c.rep_id as string, c.employment_type as 'full_time' | 'part_time']),
    );

    const paidByStudent = new Map<string, number>();
    for (const p of (paidRows ?? []) as any[]) {
      paidByStudent.set(p.student_id, (paidByStudent.get(p.student_id) ?? 0) + ((p.amount as number) ?? 0));
    }
    const ownedBy = new Map<string, { student: string; status: string | null }[]>();
    for (const l of (leads ?? []) as any[]) {
      const arr = ownedBy.get(l.owner_id) ?? [];
      arr.push({ student: l.student_id, status: l.status ?? null });
      ownedBy.set(l.owner_id, arr);
    }
    const actsBy = new Map<string, any[]>();
    for (const a of (acts ?? []) as any[]) {
      if (!a.actor_id) continue; // vendor/observed rows have no CareerRai actor
      const arr = actsBy.get(a.actor_id) ?? [];
      arr.push(a);
      actsBy.set(a.actor_id, arr);
    }
    const fuBy = new Map<string, { due: number; overdue: number }>();
    for (const f of openFollowups ?? []) {
      const cur = fuBy.get(f.ownerId) ?? { due: 0, overdue: 0 };
      const b = bucketFor(f.dueAt, now);
      if (b === 'overdue') cur.overdue++; else if (b === 'today') cur.due++;
      fuBy.set(f.ownerId, cur);
    }

    reps = ((staffRows ?? []) as any[]).map((s) => {
      const owned = ownedBy.get(s.id) ?? [];
      const mine = actsBy.get(s.id) ?? [];
      const fu = fuBy.get(s.id) ?? { due: 0, overdue: 0 };
      const paidStudents = owned.filter((o) => paidByStudent.has(o.student));
      return {
        id: s.id,
        name: (s.full_name as string | null) ?? (s.email as string | null) ?? s.id,
        leadsOwned: owned.length,
        contactedSelfReported: new Set(mine.filter((a) => a.provenance === 'self_reported').map((a) => a.student_id)).size,
        callsVendorConfirmed: mine.filter((a) => a.provenance === 'vendor_reported' && a.external_ref).length,
        followupsDue: fu.due,
        followupsOverdue: fu.overdue,
        interested: owned.filter((o) => o.status === 'interested').length,
        paidObserved: paidStudents.length,
        revenueObservedPaise: paidStudents.reduce((sum, o) => sum + (paidByStudent.get(o.student) ?? 0), 0),
        lastActivityAt: mine.length
          ? mine.map((a) => a.created_at as string).sort().slice(-1)[0]
          : null,
        employmentType: employmentById.get(s.id) ?? null,
      };
    // Every rep, including ones with an empty book — a rep who did nothing is
    // exactly who the founder is looking for, and dropping empty rows would
    // hide them.
    // BY NAME — the same rule as repOutcomes() in student-success-mis.ts.
    //
    // This used to sort by leadsOwned descending, which reads as a ranking
    // and behaves as one: a part-time rep works a deliberately smaller book,
    // so employment terms the founder set would have permanently pinned them
    // to the bottom of the team table. A stable alphabetical order says what
    // this table is — a roster with each person's numbers beside them.
    }).sort((a, b) => a.name.localeCompare(b.name));
  } catch (e) {
    console.error('[tower] rep rollup failed:', e);
    reps = null;
  }

  return {
    crmInUse: crmInUse(activityTotal, totalLeads),
    today: [
      metric('New students today', newLeadsToday, 'observed', 'profiles.created_at (IST day)'),
      metric('Leads in the CRM', totalLeads, 'observed', 'lead_outreach'),
      metric('Unassigned', unassigned, 'observed', 'lead_outreach WHERE owner_id IS NULL', 'Assign from the queue below'),
      metric('Activity logged today', activityToday, 'self_reported', 'sales_activity (IST day)'),
      metric('Follow-ups due today', followupCounts?.today ?? null, 'self_reported', 'sales_followup'),
      metric('Follow-ups overdue', followupCounts?.overdue ?? null, 'self_reported', 'sales_followup', 'Work these first'),
      metric('Stale (owned, 14d untouched)', stale, 'observed', 'lead_outreach.updated_at', 'Redistribute'),
      metric('Vendor events awaiting repair', unmatched, 'observed', "expedify_events resolution='unmatched'"),
    ],
    pipeline: [
      metric('Paywall viewed', null, 'not_instrumented', 'analytics_events (new — no history)'),
      metric('Checkout opened', null, 'not_instrumented', 'analytics_events (new — no history)'),
      metric('Paid (all time)', paidTotal, 'observed', "student_payments status='paid'"),
    ],
    reps,
    staff,
    followupCounts,
    unassignedCount: unassigned,
    staleCount: stale,
    unmatchedVendorCount: unmatched,
    // 5 paid customers total. A per-rep percentage here would be a number with
    // a decimal point and no meaning, and the founder explicitly refused it.
    conversionRateSuppressed: paidTotal === null || paidTotal < MIN_PAID_FOR_RATES,
    paidTotal,
  };
}
