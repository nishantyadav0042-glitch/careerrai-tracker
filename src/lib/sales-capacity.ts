import { classifyLane, RETENTION_LANES, type DueReason } from '@/lib/call-queue';
import { chunkIds } from '@/lib/truth/batch';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Rep capacity: OWNED ≠ ACTIVE ≠ DORMANT ≠ CLOSED ─────────────────────────
//
// Phase 2B-1 (24 Aug 2026). OBSERVATION ONLY — nothing in this module writes
// ownership, and nothing here assigns anything. It answers one question:
// "how much live work is this rep holding right now, and how much more could
// they take?"
//
// THE CORRECTION THIS MODEL EXISTS FOR (architecture gate, §2):
// a conventional CRM counts open leads, because a lead converts or dies and
// the slot recycles. A CareerRai rep works a RELATIONSHIP, which never closes:
// a student who is called, comes back, and studies happily is still owned and
// still not converted. Counting owned students would mean a rep who retains 50
// students perfectly reaches capacity and never receives another lead again —
// doing the job well is what locks them out. So capacity counts ACTIVE WORK,
// and a healthy student goes dormant, costing nothing, until they need help
// again — at which point they come back to the SAME rep (sticky ownership).

export type BindingReason =
  | 'ASSIGNABLE'          // slots free
  | 'CAPACITY_BINDING'    // active work is at the ceiling
  | 'DAILY_CAP_BINDING'   // capacity exists, today's intake fuse is spent
  | 'OVERFLOW'            // active work EXCEEDS the ceiling
  | 'OUT_OF_HOURS'        // outside work_days / work hours
  | 'UNAVAILABLE'         // leave / paused
  | 'INACTIVE'            // active = false
  | 'NOT_CONFIGURED';     // no config row — never render this as "0"

export interface RepConfig {
  repId: string;
  active: boolean;
  employmentType: 'full_time' | 'part_time';
  workDays: number[];           // ISO 1=Mon … 7=Sun
  workStartIst: string;         // 'HH:MM'
  workEndIst: string;           // 'HH:MM'
  maxCapacityUnits: number;
  maxNewPerDay: number;
  firstContactSlaMinutes: number;
  unavailableUntil: string | null;
  capacityOverride: number | null;
  overrideUntil: string | null;
}

/** Why one owned lead is consuming a capacity unit. */
export type ActiveReason = 'never_contacted' | 'action_due' | 'followup_overdue' | 'retention_lane';

export interface WorkItem {
  studentId: string;
  name: string;
  reason: ActiveReason;
  detail: string;               // human-readable evidence, shown on drill-down
  lane: DueReason | null;
}

export interface RepCapacity {
  repId: string;
  name: string;
  configured: boolean;
  config: RepConfig | null;
  capacity: number | null;      // null when NOT_CONFIGURED
  activeNow: number;
  available: number;
  newToday: number;
  overflow: number;
  inWindow: boolean;
  binding: BindingReason;
  /** THE list behind activeNow. The count is `.length` of this array, so a
   *  displayed number and its drill-down cannot diverge (SCALE-CONTRACT §4). */
  workItems: WorkItem[];
  /** Owned but not consuming capacity — the healthy book. */
  dormantCount: number;
}

const CLOSED_STATUSES = new Set(['converted', 'not_interested', 'dnd']);

// ── Pure functions (unit-tested without a database) ─────────────────────────

/** Phase 2 counts one unit per active item. Weighted workload (a 20-minute
 *  call costs more than a reminder) is a FUTURE extension: it changes this
 *  one function, not the schema, the algorithm, or the ceiling's meaning. */
export function workItemWeight(_item: WorkItem): number {
  void _item;
  return 1;
}

export function activeUnits(items: WorkItem[]): number {
  return items.reduce((sum, i) => sum + workItemWeight(i), 0);
}

/** IST wall-clock parts for a given instant. */
function istParts(nowMs: number): { isoDay: number; minutes: number } {
  const ist = new Date(nowMs + 5.5 * 3600_000);
  const day = ist.getUTCDay();               // 0=Sun … 6=Sat
  return { isoDay: day === 0 ? 7 : day, minutes: ist.getUTCHours() * 60 + ist.getUTCMinutes() };
}

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function inWorkingWindow(cfg: RepConfig, nowMs: number): boolean {
  if (!cfg.active) return false;
  if (cfg.unavailableUntil && Date.parse(cfg.unavailableUntil) > nowMs) return false;
  const { isoDay, minutes } = istParts(nowMs);
  if (!cfg.workDays.includes(isoDay)) return false;
  return minutes >= hhmmToMinutes(cfg.workStartIst) && minutes < hhmmToMinutes(cfg.workEndIst);
}

/** An expiring override beats the standing ceiling; an expired one is ignored
 *  rather than silently becoming permanent. */
export function capacityOf(cfg: RepConfig, nowMs: number): number {
  if (cfg.capacityOverride != null && cfg.overrideUntil && Date.parse(cfg.overrideUntil) > nowMs) {
    return cfg.capacityOverride;
  }
  return cfg.maxCapacityUnits;
}

export function overflowOf(activeNow: number, capacity: number): number {
  return Math.max(0, activeNow - capacity);
}

/**
 * How many NEW leads this rep could take right now.
 *
 * Floored at 0, which is what makes the overflow case safe: a rep 8 units over
 * capacity computes to 0, not to a negative number that some later arithmetic
 * could turn back into headroom.
 *
 * NOTE (Phase 2B-1 is observation only): nothing calls this to move a student.
 * It exists so the founder can see available capacity before any automation is
 * permitted to exist.
 */
export function assignableNow(input: {
  capacity: number; activeNow: number; maxNewPerDay: number; newToday: number; inWindow: boolean;
}): number {
  if (!input.inWindow) return 0;
  return Math.max(0, Math.min(input.capacity - input.activeNow, input.maxNewPerDay - input.newToday));
}

/** The founder never sees "0 available" without the reason it is 0. */
export function bindingReason(input: {
  configured: boolean; cfg: RepConfig | null; nowMs: number;
  capacity: number; activeNow: number; maxNewPerDay: number; newToday: number;
}): BindingReason {
  if (!input.configured || !input.cfg) return 'NOT_CONFIGURED';
  if (!input.cfg.active) return 'INACTIVE';
  if (input.cfg.unavailableUntil && Date.parse(input.cfg.unavailableUntil) > input.nowMs) return 'UNAVAILABLE';
  if (input.activeNow > input.capacity) return 'OVERFLOW';
  if (!inWorkingWindow(input.cfg, input.nowMs)) return 'OUT_OF_HOURS';
  if (input.activeNow >= input.capacity) return 'CAPACITY_BINDING';
  if (input.newToday >= input.maxNewPerDay) return 'DAILY_CAP_BINDING';
  return 'ASSIGNABLE';
}

export const BINDING_LABEL: Record<BindingReason, string> = {
  ASSIGNABLE: 'Slots free',
  CAPACITY_BINDING: 'Active capacity',
  DAILY_CAP_BINDING: 'New-leads/day cap',
  OVERFLOW: 'Over capacity',
  OUT_OF_HOURS: 'Outside working hours',
  UNAVAILABLE: 'On leave / paused',
  INACTIVE: 'Rep switched off',
  NOT_CONFIGURED: 'Not configured',
};

/**
 * Classify ONE owned lead. The four active conditions from the architecture
 * gate — every one of them an event that ENDS, never a standing flag.
 *
 * Returns null when the lead is dormant (owned, no live work) or closed.
 */
export function classifyWorkItem(input: {
  studentId: string; name: string; status: string | null;
  nextActionAt: string | null; hasOverdueFollowup: boolean;
  retentionLane: DueReason | null; laneDetail: string | null;
  nowMs: number;
}): WorkItem | null {
  if (input.status && CLOSED_STATUSES.has(input.status)) return null;   // CLOSED

  // A1 — never contacted. Inherent work: nobody has spoken to them yet.
  if (!input.status || input.status === 'not_contacted') {
    return { studentId: input.studentId, name: input.name, reason: 'never_contacted', detail: 'Never contacted', lane: input.retentionLane };
  }
  // A2 — a promise or retry is due (the one cadence clock).
  if (input.nextActionAt && Date.parse(input.nextActionAt) <= input.nowMs) {
    return { studentId: input.studentId, name: input.name, reason: 'action_due', detail: 'Callback or retry due now', lane: input.retentionLane };
  }
  // A3 — an open follow-up promise has passed its time.
  if (input.hasOverdueFollowup) {
    return { studentId: input.studentId, name: input.name, reason: 'followup_overdue', detail: 'Promised follow-up overdue', lane: input.retentionLane };
  }
  // A4 — the student needs a retention intervention right now. Retention
  // lanes only (see RETENTION_LANES) — the conversion lane is cumulative and
  // would never clear.
  if (input.retentionLane && RETENTION_LANES.has(input.retentionLane)) {
    return { studentId: input.studentId, name: input.name, reason: 'retention_lane', detail: input.laneDetail ?? 'Needs a retention call', lane: input.retentionLane };
  }
  return null;                                                          // DORMANT
}

// ── Reader (bounded: reads a rep's OWNED book, never the roster) ────────────

function rowToConfig(r: any): RepConfig {
  return {
    repId: r.rep_id, active: r.active === true, employmentType: r.employment_type,
    workDays: (r.work_days ?? []) as number[],
    workStartIst: String(r.work_start_ist).slice(0, 5),
    workEndIst: String(r.work_end_ist).slice(0, 5),
    maxCapacityUnits: r.max_capacity_units, maxNewPerDay: r.max_new_per_day,
    firstContactSlaMinutes: r.first_contact_sla_minutes,
    unavailableUntil: r.unavailable_until ?? null,
    capacityOverride: r.capacity_override ?? null, overrideUntil: r.override_until ?? null,
  };
}

/**
 * Capacity for every staff member, with the exact work items behind each
 * number.
 *
 * DELIBERATELY NOT built on getRosterMomentum: that loads the entire student
 * base on every call (five unbounded reads — the ~5,000-student wall recorded
 * in the architecture gate). This reads only leads a rep already OWNS, which
 * is bounded by their ceiling, so it stays O(book) rather than O(students) at
 * any population.
 *
 * Throws nothing: an unreadable input renders as NOT CONFIGURED or an empty
 * list with the reason, never as a confident zero.
 */
export async function getTeamCapacity(admin: any, nowMs: number = Date.now()): Promise<RepCapacity[]> {
  const [{ data: staff }, { data: configs }] = await Promise.all([
    admin.from('profiles').select('id, full_name, email').in('role', ['sales', 'admin']),
    admin.from('sales_rep_config').select('*'),
  ]);
  const cfgById = new Map<string, RepConfig>((configs ?? []).map((r: any) => [r.rep_id as string, rowToConfig(r)]));
  const reps = (staff ?? []) as any[];
  if (reps.length === 0) return [];

  const repIds = reps.map((r) => r.id as string);
  // Every owned, non-closed lead across the team — the only population this
  // module ever touches.
  const owned: any[] = [];
  for (const chunk of chunkIds(repIds)) {
    const { data } = await admin
      .from('lead_outreach')
      .select('student_id, owner_id, status, next_action_at, assigned_at')
      .in('owner_id', chunk);
    for (const row of data ?? []) owned.push(row);
  }

  const studentIds = owned.map((o) => o.student_id as string);
  const names = new Map<string, string>();
  const overdueFollowup = new Set<string>();
  const logDates = new Map<string, string[]>();
  const createdAt = new Map<string, string | null>();
  const taps = new Map<string, { taps: number; door: boolean }>();

  if (studentIds.length > 0) {
    const nowIso = new Date(nowMs).toISOString();
    const since30 = new Date(nowMs - 30 * 86_400_000).toISOString().slice(0, 10);
    for (const chunk of chunkIds(studentIds)) {
      const [{ data: profs }, { data: fups }, { data: reports }, { data: eng }] = await Promise.all([
        admin.from('profiles').select('id, full_name, created_at').in('id', chunk),
        admin.from('sales_followup').select('student_id').eq('status', 'open').lte('due_at', nowIso).in('student_id', chunk),
        admin.from('daily_reports').select('student_id, report_date').gte('report_date', since30).in('student_id', chunk),
        admin.from('student_engagement').select('student_id, buddy_cta_clicks, intent_door_at').in('student_id', chunk),
      ]);
      for (const p of profs ?? []) { names.set(p.id, p.full_name ?? 'Student'); createdAt.set(p.id, p.created_at ?? null); }
      for (const f of fups ?? []) overdueFollowup.add(f.student_id);
      for (const r of reports ?? []) {
        if (!logDates.has(r.student_id)) logDates.set(r.student_id, []);
        logDates.get(r.student_id)!.push(r.report_date);
      }
      for (const e of eng ?? []) taps.set(e.student_id, { taps: e.buddy_cta_clicks ?? 0, door: e.intent_door_at != null });
    }
  }

  const todayIst = new Date(nowMs).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const itemsByRep = new Map<string, WorkItem[]>();
  const dormantByRep = new Map<string, number>();
  const newTodayByRep = new Map<string, number>();

  for (const o of owned) {
    const sid = o.student_id as string;
    const rep = o.owner_id as string;
    const e = taps.get(sid);
    // classifyLane is THE lane authority; capacity consumes its verdict and
    // never re-implements a predicate of its own.
    const lane = classifyLane({
      todayIst, createdAt: createdAt.get(sid) ?? null, logDates: logDates.get(sid) ?? [],
      buddyTaps: e?.taps ?? 0, intentDoor: e?.door ?? false, momentumScore: 0,
    });
    const item = classifyWorkItem({
      studentId: sid, name: names.get(sid) ?? 'Student', status: o.status ?? null,
      nextActionAt: o.next_action_at ?? null, hasOverdueFollowup: overdueFollowup.has(sid),
      retentionLane: lane.dueReason, laneDetail: lane.why[0] ?? null, nowMs,
    });
    if (item) {
      if (!itemsByRep.has(rep)) itemsByRep.set(rep, []);
      itemsByRep.get(rep)!.push(item);
    } else if (!(o.status && CLOSED_STATUSES.has(o.status))) {
      dormantByRep.set(rep, (dormantByRep.get(rep) ?? 0) + 1);
    }
    if (o.assigned_at && new Date(o.assigned_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) === todayIst) {
      newTodayByRep.set(rep, (newTodayByRep.get(rep) ?? 0) + 1);
    }
  }

  return reps.map((r) => {
    const cfg = cfgById.get(r.id) ?? null;
    const workItems = itemsByRep.get(r.id) ?? [];
    const activeNow = activeUnits(workItems);
    const newToday = newTodayByRep.get(r.id) ?? 0;
    const capacity = cfg ? capacityOf(cfg, nowMs) : null;
    const inWindow = cfg ? inWorkingWindow(cfg, nowMs) : false;
    const binding = bindingReason({
      configured: cfg != null, cfg, nowMs, capacity: capacity ?? 0, activeNow,
      maxNewPerDay: cfg?.maxNewPerDay ?? 0, newToday,
    });
    return {
      repId: r.id, name: r.full_name ?? r.email ?? 'Staff', configured: cfg != null, config: cfg,
      capacity, activeNow,
      available: cfg && capacity != null
        ? assignableNow({ capacity, activeNow, maxNewPerDay: cfg.maxNewPerDay, newToday, inWindow })
        : 0,
      newToday, overflow: capacity != null ? overflowOf(activeNow, capacity) : 0,
      inWindow, binding, workItems, dormantCount: dormantByRep.get(r.id) ?? 0,
    };
  });
}
