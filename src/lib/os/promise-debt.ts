import type { Exception } from '@/lib/os/exception';
import { fetchAll } from '@/lib/supabase/fetch-all';

// ── A PROMISE NOBODY KEEPS IS A SLOT NOBODY GETS BACK ────────────────────────
//
// Founder, 15 Sep 2026: "Neelam ki book baant do... we need to tap every
// student." Measured before moving anything, and the book turned out not to be
// the problem. Both books are the same size — Neelam 583, Anshul 555.
//
// What differs is the DAY. Cards dealt 7-14 Sep:
//
//   day     Anshul  fresh dealt -> worked   Neelam  fresh dealt   promise cards
//   14 Sep   71          49 -> 43            (leave)
//   11 Sep   66          17 ->  2             69         0             45
//   10 Sep   59          21 ->  4             69         0             52
//   09 Sep   84          15 ->  3            114         0            113
//   08 Sep  104          25 ->  0            104         0             99
//
// Neelam's day is ONE HUNDRED PERCENT promise cards. Not most of it — all of
// it. She has not been dealt a single never-contacted student in nine working
// days, and 333 of her 583 students have never been dealt a card at all.
//
// ══ WHY, AND WHY SPLITTING THE BOOK DOES NOT FIX IT ═════════════════════════
//
// `sales-day.ts` holds UNTRIMMABLE = {callback, followup, checkout_abandoned}.
// Incident #74 gave `retry` a ceiling (RETRY_CEILING, 20) after the retry lane
// ate whole days. `callback` never got one, deliberately: a callback is a time
// a STUDENT asked us to ring back, and the founder's rule of 2 Sep is that
// promises are never bumped. That rule is right.
//
// But an overdue promise is dealt again EVERY day until it is worked, and
// nothing ages it out. So a promise that is never kept becomes a permanent
// standing charge against the day:
//
//   rep      callbacks set   overdue   3+ days   7+ days   oldest
//   Anshul        13            1         0         0      today
//   Neelam        30           24        15        10      7 Sep
//
// Twenty-four of her ~70 daily slots are spoken for before the day begins, by
// the same twenty-four students, every morning. Moving students OUT of her
// book changes none of that: the debt travels with the promises, not with the
// book size. That is why this file exists instead of a redistribution.
//
// ══ WHAT THIS IS NOT ════════════════════════════════════════════════════════
//
// It is not a count of anyone's output, and SALES-OS §0 forbids it becoming
// one: booking callbacks is the job, and a counsellor who books many is doing
// it. The only claim here is arithmetic — this many slots are committed before
// the day starts, and this many students therefore cannot be reached today.
//
// It is also NOT a proposal to bump promises. The student asked for that call.
// The exception hands the founder the debt and the choice; it does not quietly
// resolve a commitment made to a student on the counsellor's behalf.

/** Overdue promises before the debt is worth a founder's attention. */
export const PROMISE_DEBT_MIN_OVERDUE = 10;

/**
 * Days past due before a promise counts as STUCK rather than late.
 *
 * Three, because a promise slipping a day or two is an ordinary busy week and
 * the counsellor will catch it. Past three it is being redealt and skipped
 * daily, which is the pattern that never resolves on its own.
 */
export const PROMISE_STUCK_DAYS = 3;

export interface PromiseDebtReading {
  repId: string;
  repName: string;
  /** Promises whose callback time has passed. */
  overdue: number;
  /** Of those, past PROMISE_STUCK_DAYS. */
  stuck: number;
  /** Age of the oldest overdue promise, in days. null when none. */
  oldestDays: number | null;
  isInDebt: boolean;
}

export interface PromiseRow {
  /** ISO timestamp the callback was promised for. */
  callbackAt: string;
}

export function readPromiseDebt(args: {
  repId: string; repName: string; rows: PromiseRow[]; nowMs: number;
}): PromiseDebtReading {
  const { repId, repName, rows, nowMs } = args;
  let overdue = 0;
  let stuck = 0;
  let oldestMs: number | null = null;

  for (const r of rows) {
    const at = Date.parse(r.callbackAt);
    if (!Number.isFinite(at) || at >= nowMs) continue;   // not due yet is not debt
    overdue += 1;
    const ageDays = (nowMs - at) / 86_400_000;
    if (ageDays >= PROMISE_STUCK_DAYS) stuck += 1;
    if (oldestMs == null || at < oldestMs) oldestMs = at;
  }

  return {
    repId,
    repName,
    overdue,
    stuck,
    oldestDays: oldestMs == null ? null : Math.floor((nowMs - oldestMs) / 86_400_000),
    // Both, never either. Ten promises that all slipped this morning is a busy
    // day, not a debt; one promise from last month is untidy, not a blockage.
    isInDebt: overdue >= PROMISE_DEBT_MIN_OVERDUE && stuck > 0,
  };
}

/** The sentence the founder reads. Arithmetic, not character. */
export function promiseDebtReason(r: PromiseDebtReading): string {
  return `${r.overdue} promised callbacks in ${r.repName}'s book are past their time`
    + (r.stuck > 0 ? `, ${r.stuck} of them by more than ${PROMISE_STUCK_DAYS} days` : '')
    + (r.oldestDays != null ? ` (the oldest is ${r.oldestDays} days old)` : '')
    + `. A promise is never bumped, so each one is dealt again every morning until it is worked — `
    + `${r.overdue} of the day's slots are committed before it starts, to the same ${r.overdue} students. `
    + `That is why new students are not being reached, and moving the book would not change it.`;
}

/**
 * Severity 'high': no student is in a broken state, but every day this stands
 * is a day the never-contacted half of the book cannot be reached — and the
 * students who were PROMISED a call are also still waiting.
 */
export function promiseDebtException(r: PromiseDebtReading, detectedAtMs: number): Exception {
  const day = new Date(detectedAtMs + 5.5 * 3600_000).toISOString().slice(0, 10);
  return {
    id: `promise-debt:${r.repId}:${day}`,
    code: 'promises_overdue_blocking_day',
    domain: 'system',
    entity: { kind: 'sales_rep', id: r.repId, label: r.repName },
    severity: 'high',
    reason: promiseDebtReason(r),
    detectedAtMs,
    evidence: {
      overdue_promises: r.overdue,
      stuck_past_days: r.stuck,
      stuck_threshold_days: PROMISE_STUCK_DAYS,
      oldest_overdue_days: r.oldestDays,
      min_overdue: PROMISE_DEBT_MIN_OVERDUE,
    },
    // The action is to CLEAR them — ring the students who were promised a
    // call — never to cancel them. A promise the student is owed is not ours
    // to delete because it has become inconvenient to our throughput.
    suggestedAction: {
      label: `Clear ${r.repName}'s ${r.overdue} overdue promises — those students are still waiting`,
      route: `/admin/sales-performance?rep=${r.repId}`,
    },
    recovery: { attempted: false, status: 'none' },
    owner: 'founder',
    destination: `/admin/sales-performance?rep=${r.repId}`,
    lifecycle: 'detected',
  };
}

type Admin = { from: (t: string) => any };   // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Read every active seat's promise debt.
 *
 * Paged (Incident #65): `lead_outreach` is population-scaled and already past
 * a thousand rows, and an unbounded read would under-count the exact number
 * this exists to report. Any read failure returns nothing rather than a flag.
 */
export async function findPromiseDebt(admin: Admin, nowMs: number): Promise<Exception[]> {
  const { data: seats, error: seatErr } = await admin
    .from('sales_rep_config').select('rep_id').eq('active', true);
  if (seatErr || !seats?.length) return [];
  const repIds = (seats as Array<{ rep_id: string }>).map((s) => s.rep_id);

  const { data: people } = await admin.from('profiles').select('id, full_name').in('id', repIds);
  const nameOf = new Map(((people ?? []) as Array<{ id: string; full_name: string | null }>)
    .map((p) => [p.id, p.full_name ?? 'Counsellor']));

  const { data: rows, error: rowErr } = await fetchAll<{ owner_id: string; callback_at: string | null }>(
    () => admin.from('lead_outreach').select('student_id, owner_id, callback_at')
      .in('owner_id', repIds).not('callback_at', 'is', null),
    { orderBy: 'student_id' },
  );
  if (rowErr || !rows) return [];

  const out: Exception[] = [];
  for (const repId of repIds) {
    const mine = rows
      .filter((r) => r.owner_id === repId && r.callback_at)
      .map((r) => ({ callbackAt: r.callback_at as string }));
    const reading = readPromiseDebt({
      repId, repName: nameOf.get(repId) ?? 'Counsellor', rows: mine, nowMs,
    });
    if (reading.isInDebt) out.push(promiseDebtException(reading, nowMs));
  }
  return out;
}
