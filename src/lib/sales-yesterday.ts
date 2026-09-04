// ── YESTERDAY, AS A NUMBER THE WHOLE COMPANY AGREES ON ──────────────────────
//
// Founder order, 3 Sep: both reps see a snapshot of yesterday's own work the
// moment they open the workspace, and the founder sees the same two snapshots
// compiled on the Control Tower. ONE module computes all of it, so the number
// a rep reads and the number the founder reads can never drift — the rep view
// and the tower view are the same function with a different repId.
//
// THE SOURCE IS sales_activity AND NOTHING ELSE. SALES-OS §8: "worked means
// dispositioned" — pressing call is not work, opening a profile is not work,
// and telemetry may never become a performance measure (§0). Every count here
// is a row a rep deliberately recorded, which also makes the evidence class
// SELF-REPORTED (the system has no telephony record), and the tower labels it
// that way like everything else it shows.
//
// SCALE-CONTRACT: every number drills down — each count is a filter over
// sales_activity(actor_id, created_at window, status); nothing is computed
// that a founder could not reproduce with one query.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { ACTIVITY_STATUSES } from '@/lib/sales-disposition';
import { isTypedRemark } from '@/lib/sales-remarks';

const IST_OFFSET_MS = 5.5 * 3600_000;
const DAY_MS = 24 * 3600_000;

/** The IST calendar day that ended most recently, as a UTC half-open window.
 *  The sales team lives in IST; "yesterday" at 00:30 IST must mean the day
 *  that just closed, not a UTC day that still has 5½ hours to run. */
export function istYesterdayWindow(nowMs: number = Date.now()): { startIso: string; endIso: string; label: string } {
  const istNow = new Date(nowMs + IST_OFFSET_MS);
  // Midnight of the CURRENT IST day, expressed back in real UTC ms.
  const istMidnightUtcMs =
    Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()) - IST_OFFSET_MS;
  const startMs = istMidnightUtcMs - DAY_MS;
  const labelDate = new Date(startMs + IST_OFFSET_MS);
  return {
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(istMidnightUtcMs).toISOString(),
    label: labelDate.toISOString().slice(0, 10),
  };
}

/** Rows the sales day is made of. 'reassigned' is bookkeeping, not work. */
const WORK_STATUSES = ACTIVITY_STATUSES.filter((s) => s !== 'reassigned');

// The rep's words vs the system's auto-note. The rule lives in
// lib/sales-remarks — the calling card leads with the newest typed remark and
// this snapshot counts them, and one rule serving both is why those two
// surfaces can never disagree. Re-exported so this module stays the single
// import for everything "yesterday".
export { isTypedRemark } from '@/lib/sales-remarks';

export interface DaySnapshot {
  repId: string;
  label: string;              // the IST date this describes, YYYY-MM-DD
  attempts: number;           // dispositions recorded (excl. reassigned)
  studentsTouched: number;    // distinct students behind those rows
  byOutcome: Record<string, number>;
  callbacksSet: number;       // rows that scheduled a callback time
  remarksTyped: number;       // notes the rep wrote, not system auto-notes
}

/** One rep, one IST day, straight off sales_activity. */
export async function repDaySnapshot(
  admin: any,
  repId: string,
  window: { startIso: string; endIso: string; label: string },
): Promise<DaySnapshot> {
  const { data } = await admin
    .from('sales_activity')
    .select('student_id, status, note, callback_at')
    .eq('actor_id', repId)
    .gte('created_at', window.startIso)
    .lt('created_at', window.endIso);

  const rows = ((data ?? []) as Array<{ student_id: string; status: string; note: string | null; callback_at: string | null }>)
    .filter((r) => (WORK_STATUSES as readonly string[]).includes(r.status));

  const byOutcome: Record<string, number> = {};
  const students = new Set<string>();
  let callbacksSet = 0;
  let remarksTyped = 0;
  for (const r of rows) {
    byOutcome[r.status] = (byOutcome[r.status] ?? 0) + 1;
    if (r.student_id) students.add(r.student_id);
    if (r.callback_at) callbacksSet += 1;
    if (isTypedRemark(r.status, r.note)) remarksTyped += 1;
  }

  return {
    repId,
    label: window.label,
    attempts: rows.length,
    studentsTouched: students.size,
    byOutcome,
    callbacksSet,
    remarksTyped,
  };
}

export interface TeamYesterday {
  label: string;
  reps: Array<DaySnapshot & { repName: string }>;
  combined: Omit<DaySnapshot, 'repId'>;
}

/** Every ACTIVE seat's yesterday, plus the compiled line the founder reads.
 *  The combined row is the SUM of the per-rep snapshots — computed from them,
 *  never queried separately, so the two views cannot disagree. */
export async function teamYesterday(admin: any, nowMs: number = Date.now()): Promise<TeamYesterday> {
  const window = istYesterdayWindow(nowMs);
  const { data: seats } = await admin
    .from('sales_rep_config')
    .select('rep_id')
    .eq('active', true);
  const repIds: string[] = ((seats ?? []) as Array<{ rep_id: string }>).map((s) => s.rep_id);

  const { data: profiles } = repIds.length
    ? await admin.from('profiles').select('id, full_name').in('id', repIds)
    : { data: [] };
  const nameOf = new Map(((profiles ?? []) as Array<{ id: string; full_name: string | null }>)
    .map((p) => [p.id, p.full_name ?? 'Unnamed rep']));

  const reps = await Promise.all(repIds.map(async (id) => ({
    ...(await repDaySnapshot(admin, id, window)),
    repName: nameOf.get(id) ?? 'Unnamed rep',
  })));

  const combined: Omit<DaySnapshot, 'repId'> = {
    label: window.label,
    attempts: reps.reduce((n, r) => n + r.attempts, 0),
    studentsTouched: reps.reduce((n, r) => n + r.studentsTouched, 0),
    byOutcome: reps.reduce<Record<string, number>>((acc, r) => {
      for (const [k, v] of Object.entries(r.byOutcome)) acc[k] = (acc[k] ?? 0) + v;
      return acc;
    }, {}),
    callbacksSet: reps.reduce((n, r) => n + r.callbacksSet, 0),
    remarksTyped: reps.reduce((n, r) => n + r.remarksTyped, 0),
  };

  return { label: window.label, reps, combined };
}
