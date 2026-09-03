import { loadStaffDirectory, type StaffDirectory } from '@/lib/sales-authz';
import { SECTION_OF, type DaySection } from '@/lib/sales-day';
import { ROTATION_SILENT_DAYS } from '@/lib/os/scale-config';
import { fetchAll } from '@/lib/supabase/fetch-all';
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
  /** The daily intake (lib/lead-intake): did new students enter books today? */
  intake: IntakeView;
  /** Coverage of the book (founder, 2 Sep): is every student being tracked? */
  coverage: CoverageView;
}

/** Closed for sales — never counted in a book that needs tracking. */
const CLOSED: ReadonlySet<string> = new Set(['converted', 'not_interested', 'dnd']);

export interface RepCoverage {
  repId: string;
  name: string;
  /** Owned and not closed. */
  book: number;
  /** Touched (any call or message) in the last ROTATION_SILENT_DAYS. */
  touched21d: number;
  /** Never touched by anyone, ever. */
  neverTouched: number;
  /** Today's offer by section, from sales_opportunity (what the system gave). */
  givenToday: Record<DaySection, number>;
  workedToday: number;
  calledToday: number;
  messagedToday: number;
}

export interface CoverageView {
  reps: RepCoverage[] | null;
  /** Rows the coverage was read from — null means a read failed and nothing above is a number. */
  failed: string | null;
}

/**
 * Coverage — the one number the 50–70 day exists for. Reads the OWNED book
 * (bounded by the team's books), today's activity and today's offer; every
 * count is derived from rows and none is self-reported.
 */
export async function readCoverage(admin: any, staff: StaffDirectory | null, dayStart: string, todayIst: string, nowMs: number): Promise<CoverageView> {
  const nameOf = (id: string) => staff?.labelById.get(id) ?? 'Staff';
  const empty = (): Record<DaySection, number> => ({ promises: 0, money: 0, buddy: 0, new: 0, attention: 0, retention: 0, rotation: 0 });
  try {
    const book = await fetchAll<{ owner_id: string | null; status: string | null; last_attempt_at: string | null }>(
      () => admin.from('lead_outreach').select('owner_id, status, last_attempt_at').not('owner_id', 'is', null),
      { orderBy: 'student_id' });
    if (book.error || !book.data) return { reps: null, failed: `lead_outreach: ${book.error?.message ?? 'no data'}` };
    const acts = await fetchAll<{ actor_id: string | null; activity_type: string | null }>(
      () => admin.from('sales_activity').select('actor_id, activity_type').gte('created_at', dayStart).in('activity_type', ['call', 'whatsapp']),
      { orderBy: 'id' });
    if (acts.error || !acts.data) return { reps: null, failed: `sales_activity: ${acts.error?.message ?? 'no data'}` };
    const offers = await fetchAll<{ rep_id: string; lane: string; worked_at: string | null }>(
      () => admin.from('sales_opportunity').select('rep_id, lane, worked_at').eq('ist_day', todayIst),
      { orderBy: 'id' });
    if (offers.error || !offers.data) return { reps: null, failed: `sales_opportunity: ${offers.error?.message ?? 'no data'}` };

    const by = new Map<string, RepCoverage>();
    const get = (id: string) => {
      if (!by.has(id)) by.set(id, { repId: id, name: nameOf(id), book: 0, touched21d: 0, neverTouched: 0, givenToday: empty(), workedToday: 0, calledToday: 0, messagedToday: 0 });
      return by.get(id)!;
    };
    const cutoff = nowMs - ROTATION_SILENT_DAYS * 86_400_000;
    for (const r of book.data) {
      if (!r.owner_id) continue;
      if (r.status && CLOSED.has(r.status)) continue;
      const c = get(r.owner_id);
      c.book++;
      if (!r.last_attempt_at) c.neverTouched++;
      else if (Date.parse(r.last_attempt_at) >= cutoff) c.touched21d++;
    }
    for (const a of acts.data) {
      if (!a.actor_id || !by.has(a.actor_id)) continue;
      if (a.activity_type === 'whatsapp') get(a.actor_id).messagedToday++;
      else get(a.actor_id).calledToday++;
    }
    for (const o of offers.data) {
      if (!by.has(o.rep_id)) continue;
      const c = get(o.rep_id);
      const section = (SECTION_OF as Record<string, DaySection>)[o.lane] ?? 'rotation';
      c.givenToday[section]++;
      if (o.worked_at) c.workedToday++;
    }
    return { reps: [...by.values()].sort((a, b) => a.name.localeCompare(b.name)), failed: null };
  } catch (e) {
    return { reps: null, failed: e instanceof Error ? e.message : 'threw' };
  }
}

export interface IntakeView {
  /** Students who entered a book today (IST), per seat. null = could not read. */
  enrolledToday: { repId: string; name: string; count: number }[] | null;
  /** The engine's last run, from cron_runs. null = it has never run — which
   *  is itself the fact the founder most needs to see. */
  lastRun: { at: string; ok: boolean; state: string; enrolled: number; waiting: number | null; error: string | null } | null;
}

/** Bounded: today's intake is at most Σ max_new_per_day, and the last run is one row. */
export async function readIntake(admin: any, dayStart: string, staff: StaffDirectory | null): Promise<IntakeView> {
  const nameOf = (id: string) => staff?.labelById.get(id) ?? 'Staff';
  let enrolledToday: IntakeView['enrolledToday'] = null;
  try {
    const { data, error } = await fetchAll<{ owner_id: string | null }>(
      () => admin.from('lead_outreach').select('owner_id').gte('enrolled_at', dayStart).not('owner_id', 'is', null),
      { orderBy: 'student_id' });
    if (error || !data) console.error('[tower] intake read failed:', error?.message);
    else {
      const by = new Map<string, number>();
      for (const r of data) if (r.owner_id) by.set(r.owner_id, (by.get(r.owner_id) ?? 0) + 1);
      enrolledToday = [...by.entries()].map(([repId, count]) => ({ repId, name: nameOf(repId), count }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
  } catch (e) { console.error('[tower] intake read threw:', e); }

  let lastRun: IntakeView['lastRun'] = null;
  try {
    const { data, error } = await admin.from('cron_runs')
      .select('started_at, completed_at, result, fatal_error')
      .eq('cron_path', '/api/cron/lead-intake')
      .order('started_at', { ascending: false }).limit(1).maybeSingle();
    if (error) console.error('[tower] intake last-run read failed:', error.message);
    else if (data) {
      const r = (data.result ?? {}) as any;
      const enrolled = Array.isArray(r.enrolled) ? r.enrolled.reduce((s: number, e: any) => s + (Number(e.landed) || 0), 0) : 0;
      lastRun = {
        at: data.started_at,
        ok: !data.fatal_error && r.ok === true,
        state: data.fatal_error ? 'CRASHED' : (typeof r.state === 'string' ? r.state : data.completed_at ? 'UNKNOWN' : 'RUNNING'),
        enrolled,
        waiting: typeof r.waiting === 'number' ? r.waiting : null,
        error: data.fatal_error ?? (typeof r.error === 'string' ? r.error : null),
      };
    }
  } catch (e) { console.error('[tower] intake last-run read threw:', e); }

  return { enrolledToday, lastRun };
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

  const intake = await readIntake(admin, dayStart, staff);
  const coverage = await readCoverage(admin, staff, dayStart, istToday, now);

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
    intake,
    coverage,
  };
}
