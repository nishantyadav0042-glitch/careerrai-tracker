import { readAllRows, readRows } from '@/lib/truth/source';
import { chunkIds } from '@/lib/truth/batch';
import { getServerConfig } from '@/lib/server-config';
import { auditSales } from '@/lib/sales-audit';
import { MAX_PORTFOLIO_PER_SEAT } from '@/lib/sales-rep-provisioning';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── The daily lead intake — new students enter a book every day ─────────────
//
// Founder, 2 Sep 2026: "are new students being added to the salesmen's lists
// daily?" Verified in production: no. lead_outreach held 124 rows, all written
// by the manual enrolment on 29 Aug and untouched since; 916 real students had
// never been in any book, 172 of whom had signed up in the previous seven
// days. Anshul and Neelam were working a frozen list while the base grew by
// ~20 students a day.
//
// This is Phase 2B-3 of docs/SALES-PHASE-2A-ASSIGNMENT-ARCHITECTURE.md — the
// engine that document designed and deliberately deferred until capacity
// visibility (2B-1) and SLA truth (2B-2) existed. Both do. The founder's
// earlier instruction ("no opaque automatic distribution") still governs the
// SHAPE of this engine, which is why every rule below is published, every
// number is derived from a configured ceiling, and every row written carries
// the sentence that explains it.
//
// WHAT IT DOES, in one paragraph. Once a day it takes every real, free student
// with a phone who is not yet in any book, newest signup first, and enrols
// them into the books of the active sales seats — split in proportion to how
// many each seat may still take today, alternating so both seats get the
// newest students, never more than a seat's max_new_per_day (the daily fuse of
// Amendment 3) and never beyond MAX_PORTFOLIO_PER_SEAT. It writes ownership
// with ON CONFLICT DO NOTHING, so two overlapping runs, a retry after a
// timeout, or a founder enrolling by hand at the same moment can never move a
// student who already belongs to someone. Then it records what it did: a
// sales_activity row per student naming the rule, one audit row per run.
//
// WHAT IT DOES NOT DO. It does not hand out LIVE WORK. The book is
// responsibility (sales-rep-provisioning.ts: "owning a student is not working
// a student"); the queue (call-queue.ts) still decides which of the owned
// students are today's opportunities, capped by active capacity. It never
// touches a student who already has an owner — manual always beats the engine
// (2A §7). And it never invents eligibility: a premium student has converted
// and a student with no phone cannot be called, so neither enters a book.
//
// THE TWO CLOCKS. enrolled_at is stamped on every row this engine writes: it
// is what "new today" means and what the daily fuse counts. assigned_at — the
// first-contact SLA clock — is stamped ONLY for a student who signed up in the
// last NEW_ARRIVAL_HOURS. The rest of the pool is backlog: students who signed
// up weeks ago and were never anybody's lead. Starting fifty two-hour clocks
// on them at once would report fifty breaches by evening and measure nothing
// but the day the backlog was drained (the same reasoning as enrol-book's
// header). Speed-to-lead is about a new arrival being called.
//
// KILL SWITCH (Ceiling 3). server_config key SALES_INTAKE_ENABLED, or the env
// var of the same name. Absent means ON. The literal strings 'false', '0' and
// 'off' mean OFF: the run exits before reading anything and says so. A switch
// the founder cannot flip without a deploy is not a switch.
//
// SCALE (docs/SCALE-CONTRACT.md). Today the pool read is the whole roster,
// paged (two pages at 1,058 students). It is correct at 100,000 but wasteful:
// the 100k path is a `students_without_book(limit)` RPC that returns only the
// newest N unowned students, which is the only change this file would need.

/** server_config / env key of the kill switch. Absent = enabled. */
export const INTAKE_KILL_SWITCH_KEY = 'SALES_INTAKE_ENABLED';

/** A signup this recent is a NEW ARRIVAL: its SLA clock starts on enrolment. */
export const NEW_ARRIVAL_HOURS = 24;

export interface IntakeSeat {
  repId: string;
  name: string;
  active: boolean;
  unavailableUntil: string | null;
  maxNewPerDay: number;
  /** Rows already enrolled to this seat today (IST). The fuse counts these. */
  newToday: number;
  /** Rows this seat owns in total. The portfolio ceiling counts these. */
  bookSize: number;
}

export interface IntakeCandidate {
  id: string;
  createdAt: string;
}

export type SeatBound = 'daily_fuse' | 'portfolio' | 'inactive' | 'unavailable';

export interface SeatPlan {
  repId: string;
  name: string;
  /** How many this seat may still take today, before the pool is considered. */
  allowance: number;
  /** Which ceiling produced the allowance — the founder never sees a bare number. */
  boundBy: SeatBound;
  /** Students this run will enrol here, in the order they will be written. */
  studentIds: string[];
}

export type IntakeReason = 'ALLOCATED' | 'POOL_EMPTY' | 'NO_ELIGIBLE_SEAT' | 'ALL_SEATS_FUSED';

export interface IntakePlan {
  reason: IntakeReason;
  seats: SeatPlan[];
  /** Σ studentIds — how many this run will try to enrol. */
  total: number;
  poolSize: number;
  /** Eligible students left over because no seat may take them today. */
  waiting: number;
}

/** How many more this seat may take today, and which ceiling said so. */
export function seatAllowance(seat: IntakeSeat, nowMs: number): { allowance: number; boundBy: SeatBound } {
  if (!seat.active) return { allowance: 0, boundBy: 'inactive' };
  if (seat.unavailableUntil && Date.parse(seat.unavailableUntil) > nowMs) return { allowance: 0, boundBy: 'unavailable' };
  const fuse = Math.max(0, seat.maxNewPerDay - seat.newToday);
  const portfolio = Math.max(0, MAX_PORTFOLIO_PER_SEAT - seat.bookSize);
  const allowance = Math.min(fuse, portfolio);
  return { allowance, boundBy: fuse <= portfolio ? 'daily_fuse' : 'portfolio' };
}

/**
 * The allocation, as a pure function — same inputs, same output, always.
 *
 * Largest-remainder apportionment proportional to each seat's allowance
 * (2A §5 step 6), ties broken by rep id so nothing depends on read order.
 * Students are then dealt newest-first to the seat with the most of its
 * share still unfilled, so two equal seats alternate and neither is handed
 * the older half of the day.
 */
export function planIntake(seats: IntakeSeat[], pool: IntakeCandidate[], nowMs: number): IntakePlan {
  const ordered = [...pool].sort((a, b) =>
    Date.parse(b.createdAt) - Date.parse(a.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const plans: SeatPlan[] = [...seats]
    .sort((a, b) => (a.repId < b.repId ? -1 : a.repId > b.repId ? 1 : 0))
    .map((s) => ({ repId: s.repId, name: s.name, ...seatAllowance(s, nowMs), studentIds: [] as string[] }));

  const sumAllowance = plans.reduce((s, p) => s + p.allowance, 0);
  const base = { seats: plans, poolSize: ordered.length };
  if (ordered.length === 0) return { ...base, reason: 'POOL_EMPTY', total: 0, waiting: 0 };
  if (!seats.some((s) => s.active)) return { ...base, reason: 'NO_ELIGIBLE_SEAT', total: 0, waiting: ordered.length };
  if (sumAllowance === 0) return { ...base, reason: 'ALL_SEATS_FUSED', total: 0, waiting: ordered.length };

  const total = Math.min(ordered.length, sumAllowance);

  // Largest remainder: floor every share, then hand the leftover units to the
  // largest fractional parts (rep id breaks a tie).
  const shares = plans.map((p) => (total * p.allowance) / sumAllowance);
  const counts = shares.map(Math.floor);
  let leftover = total - counts.reduce((s, c) => s + c, 0);
  const byRemainder = plans
    .map((p, i) => ({ i, frac: shares[i] - counts[i], repId: p.repId }))
    .filter((x) => plans[x.i].allowance > counts[x.i])
    .sort((a, b) => b.frac - a.frac || (a.repId < b.repId ? -1 : 1));
  for (const x of byRemainder) {
    if (leftover === 0) break;
    counts[x.i]++; leftover--;
  }

  // Deal newest-first to whoever has the most of their share still open; on a
  // tie, to whoever has received fewer so far, so equal seats alternate and
  // neither is handed the older half of the day.
  const need = [...counts];
  for (let k = 0; k < total; k++) {
    let best = -1;
    for (let i = 0; i < plans.length; i++) {
      if (need[i] <= 0) continue;
      if (best === -1) { best = i; continue; }
      const dealt = plans[i].studentIds.length, dealtBest = plans[best].studentIds.length;
      if (need[i] > need[best] || (need[i] === need[best] && dealt < dealtBest)) best = i;
    }
    if (best === -1) break;
    plans[best].studentIds.push(ordered[k].id);
    need[best]--;
  }

  const dealt = plans.reduce((s, p) => s + p.studentIds.length, 0);
  return { ...base, reason: 'ALLOCATED', total: dealt, waiting: ordered.length - dealt };
}

/** The sentence stored on every row: why this student landed with this seat. */
export function assignmentReason(input: {
  seatName: string; seat: IntakeSeat; plan: SeatPlan; joinedIso: string; arrival: boolean;
}): string {
  const joined = new Date(input.joinedIso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
  const fuse = `${input.seat.newToday + input.plan.studentIds.length} of ${input.seat.maxNewPerDay} new-per-day used`;
  const book = `book ${input.seat.bookSize + input.plan.studentIds.length} of ${MAX_PORTFOLIO_PER_SEAT}`;
  const clock = input.arrival
    ? `new signup (joined ${joined}), first-contact SLA started`
    : `backlog signup (joined ${joined}), SLA not started`;
  return `Daily intake → ${input.seatName}: ${fuse}, ${book}; ${clock}.`;
}

export type IntakeState =
  | 'ENGINE_DISABLED' | 'SOURCE_UNAVAILABLE'
  | IntakeReason | 'PARTIAL';

export interface IntakeRun {
  ok: boolean;
  state: IntakeState;
  poolSize: number;
  waiting: number;
  /** New arrivals among the enrolled — the ones whose SLA clock started. */
  arrivals: number;
  enrolled: { repId: string; name: string; requested: number; landed: number; boundBy: SeatBound; allowance: number }[];
  /** Per-student history rows that failed to write. The enrolment stands. */
  historyFailed: number;
  error?: string;
}

const off = (v: string | null) => v != null && ['false', '0', 'off'].includes(v.trim().toLowerCase());

interface SeatRow { id: string; full_name: string | null }
interface BookRow { student_id: string; owner_id: string | null; enrolled_at: string | null }
interface RosterRow { id: string; created_at: string; phone: string | null; is_premium: boolean | null }

function istDayStart(nowMs: number): string {
  const day = new Date(nowMs).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  return new Date(`${day}T00:00:00+05:30`).toISOString();
}

function unavailable(poolSize: number, error: string): IntakeRun {
  return { ok: false, state: 'SOURCE_UNAVAILABLE', poolSize, waiting: 0, arrivals: 0, enrolled: [], historyFailed: 0, error };
}

/**
 * One intake run. Every read is checked before anything is written; a failed
 * read is SOURCE_UNAVAILABLE and writes nothing (B3b: a failure must never
 * look like an empty pool, and must never enrol from a partial roster).
 *
 * `actorId` is the admin who pressed "Run now", or null for the scheduler.
 */
export async function runLeadIntake(
  admin: any,
  opts: { nowMs?: number; actorId?: string | null; trigger: 'cron' | 'admin' },
): Promise<IntakeRun> {
  const nowMs = opts.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const flag = await getServerConfig(INTAKE_KILL_SWITCH_KEY, INTAKE_KILL_SWITCH_KEY);
  if (off(flag)) {
    return { ok: true, state: 'ENGINE_DISABLED', poolSize: 0, waiting: 0, arrivals: 0, enrolled: [], historyFailed: 0 };
  }

  // ── Seats ─────────────────────────────────────────────────────────────────
  //
  // The staff read is `in ('sales','admin')` like every other surface (the
  // sales role is one door, not several); what makes an account a SEAT is a
  // sales_rep_config row, so an admin with no configured seat receives nothing.
  const staff = await readAllRows<SeatRow>(
    'profiles(staff)', () => admin.from('profiles').select('id, full_name').in('role', ['sales', 'admin']));
  if (staff.state === 'unavailable') return unavailable(0, `sales seats: ${staff.reason}`);
  const seatRows = staff.state === 'value' ? staff.value : [];

  const cfg = await readRows<any>('sales_rep_config', () => admin.from('sales_rep_config').select('*'));
  if (cfg.state === 'unavailable') return unavailable(0, `sales_rep_config: ${cfg.reason}`);
  const cfgById = new Map<string, any>((cfg.state === 'value' ? cfg.value : []).map((r: any) => [r.rep_id as string, r]));

  // ── The book as it stands: who is owned, how big each book is, how many
  //    each seat already received today ─────────────────────────────────────
  const book = await readAllRows<BookRow>(
    'lead_outreach(book)',
    () => admin.from('lead_outreach').select('student_id, owner_id, enrolled_at'), { orderBy: 'student_id' });
  if (book.state === 'unavailable') return unavailable(0, book.reason);
  const already = new Set<string>();
  const bookSize = new Map<string, number>();
  const newToday = new Map<string, number>();
  const dayStart = istDayStart(nowMs);
  for (const r of book.state === 'value' ? book.value : []) {
    already.add(r.student_id);
    if (!r.owner_id) continue;
    bookSize.set(r.owner_id, (bookSize.get(r.owner_id) ?? 0) + 1);
    if (r.enrolled_at && r.enrolled_at >= dayStart) newToday.set(r.owner_id, (newToday.get(r.owner_id) ?? 0) + 1);
  }

  const seats: IntakeSeat[] = seatRows
    .filter((s) => cfgById.has(s.id))       // NOT CONFIGURED is not a seat, and never a default
    .map((s) => {
      const c = cfgById.get(s.id);
      return {
        repId: s.id, name: s.full_name ?? 'Staff',
        active: c.active === true,
        unavailableUntil: c.unavailable_until ?? null,
        maxNewPerDay: Number(c.max_new_per_day ?? 0),
        newToday: newToday.get(s.id) ?? 0,
        bookSize: bookSize.get(s.id) ?? 0,
      };
    });

  // ── The pool: real, free, reachable, not yet anybody's ────────────────────
  //
  // is_premium is filtered in code, not with .eq(false): PostgREST's eq drops
  // NULL rows, and a NULL is_premium is a free student (the NULL trap).
  const roster = await readAllRows<RosterRow>(
    'profiles(intake pool)',
    () => admin.from('profiles').select('id, created_at, phone, is_premium')
      .eq('role', 'student').not('is_test_account', 'is', true).not('is_demo', 'is', true),
    { orderBy: 'created_at', ascending: false },
  );
  if (roster.state === 'unavailable') return unavailable(0, `profiles: ${roster.reason}`);
  const pool: IntakeCandidate[] = (roster.state === 'value' ? roster.value : [])
    .filter((p) => p.is_premium !== true && !!p.phone && p.phone.trim() !== '' && !already.has(p.id))
    .map((p) => ({ id: p.id, createdAt: p.created_at }));
  const joinedById = new Map(pool.map((p) => [p.id, p.createdAt]));

  const plan = planIntake(seats, pool, nowMs);
  const seatById = new Map(seats.map((s) => [s.repId, s]));
  const enrolled: IntakeRun['enrolled'] = plan.seats.map((p) => ({
    repId: p.repId, name: p.name, requested: p.studentIds.length, landed: 0, boundBy: p.boundBy, allowance: p.allowance,
  }));
  if (plan.total === 0) {
    return { ok: true, state: plan.reason, poolSize: plan.poolSize, waiting: plan.waiting, arrivals: 0, enrolled, historyFailed: 0 };
  }

  // ── Write ─────────────────────────────────────────────────────────────────
  const arrivalCutoff = new Date(nowMs - NEW_ARRIVAL_HOURS * 3600_000).toISOString();
  let arrivals = 0;
  let historyFailed = 0;
  let partial: string | null = null;

  for (const p of plan.seats) {
    if (p.studentIds.length === 0) continue;
    const seat = seatById.get(p.repId)!;
    const out = enrolled.find((e) => e.repId === p.repId)!;
    for (const chunk of chunkIds(p.studentIds)) {
      const rows = chunk.map((id) => {
        const joined = joinedById.get(id) ?? nowIso;
        const arrival = joined >= arrivalCutoff;
        return {
          student_id: id, owner_id: p.repId, status: 'not_contacted',
          enrolled_at: nowIso, updated_at: nowIso,
          assigned_at: arrival ? nowIso : null,
        };
      });
      // ON CONFLICT DO NOTHING — the idempotency key is the row itself
      // (2A §6). An owner already in place is never overwritten, so a
      // concurrent run, a retry, or a manual enrolment at the same moment
      // converges instead of moving a student between books.
      const { data: inserted, error } = await admin.from('lead_outreach')
        .upsert(rows, { onConflict: 'student_id', ignoreDuplicates: true })
        .select('student_id');
      if (error) {
        partial = `${p.name}: ${error.message}`;
        break;
      }
      const landedIds = ((inserted ?? []) as any[]).map((r) => r.student_id as string);
      out.landed += landedIds.length;
      if (landedIds.length === 0) continue;

      const history = landedIds.map((id) => {
        const joined = joinedById.get(id) ?? nowIso;
        const arrival = joined >= arrivalCutoff;
        if (arrival) arrivals++;
        return {
          student_id: id, actor_id: opts.actorId ?? null,
          activity_type: 'assigned', provenance: 'system_generated', status: 'reassigned', channel: 'system',
          note: assignmentReason({ seatName: p.name, seat, plan: p, joinedIso: joined, arrival }),
        };
      });
      const { error: histErr } = await admin.from('sales_activity').insert(history);
      if (histErr) {
        console.error('[lead-intake] history write failed:', histErr.message);
        historyFailed += history.length;
      }
    }
    if (partial) break;
  }

  const landedTotal = enrolled.reduce((s, e) => s + e.landed, 0);
  if (landedTotal > 0) {
    await auditSales(opts.actorId ?? null, 'sales_book_enrolled', { type: 'system', id: null }, {
      after: {
        engine: 'lead-intake', trigger: opts.trigger,
        enrolled: enrolled.map((e) => ({ repId: e.repId, requested: e.requested, landed: e.landed, boundBy: e.boundBy })),
        poolSize: plan.poolSize, waiting: plan.waiting, arrivals, dayStart,
      },
      reason: 'daily lead intake',
      count: landedTotal,
    });
  }

  if (partial) {
    return {
      ok: false, state: 'PARTIAL', poolSize: plan.poolSize, waiting: plan.waiting + (plan.total - landedTotal),
      arrivals, enrolled, historyFailed,
      error: `Partially enrolled — re-run to finish. Nothing was lost; students already enrolled keep their owner. ${partial}`,
    };
  }
  return { ok: true, state: 'ALLOCATED', poolSize: plan.poolSize, waiting: plan.waiting, arrivals, enrolled, historyFailed };
}
