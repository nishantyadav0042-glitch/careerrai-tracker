import type { RepConfig } from '@/lib/sales-capacity';

// ── Speed to lead, measured in the counsellor's own working minutes ─────────
//
// `sales_rep_config.first_contact_sla_minutes` has existed since 24 Aug and
// nothing has ever measured against it, because there was no record of when a
// lead was handed over: no left-hand side, no elapsed time, no breach. The
// 25 Aug migration said so in as many words — "lead_outreach has no
// assigned_at column until 2B-2". 20260828a adds assigned_at and
// first_contact_at; this module is the arithmetic over them.
//
// WHY WORKING MINUTES AND NOT WALL CLOCK. The column's own comment states the
// rule (gate finding W6): "a 2-hour SLA on a 18:30 assignment is due the next
// working morning, not at 20:30 while nobody is working." Wall clock would
// mark every evening handover breached by morning and every part-timer
// permanently failing — which is how an SLA stops being read at all. Anshul
// and Neelam work five hours a day, six days a week, with a weekly off of
// their own choosing, so wall clock would be wrong for them on most days.
//
// External research backs the urgency but not a naive clock: inbound leads
// contacted within five minutes convert far better than ones contacted an hour
// later, and most sellers give up after a single attempt. The response to that
// is a tight SLA inside working hours plus a cadence that persists — not a
// timer that runs while a part-time counsellor is asleep.

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 5.5 * 3600_000;

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** ISO weekday (1=Mon…7=Sun) and minute-of-day, in IST, for a UTC instant. */
function istParts(ms: number): { isoDay: number; minutes: number; dayStartMs: number } {
  const ist = new Date(ms + IST_OFFSET_MS);
  const day = ist.getUTCDay();
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  // The UTC instant of 00:00 IST on this IST calendar day.
  const dayStartMs = ms - minutes * 60_000 - (ist.getUTCSeconds() * 1000 + ist.getUTCMilliseconds());
  return { isoDay: day === 0 ? 7 : day, minutes, dayStartMs };
}

/**
 * Minutes of this rep's working window between two instants. Pure.
 *
 * Walks IST calendar days and sums the overlap of each day's window with
 * [fromMs, toMs). Bounded at 370 days so a corrupt timestamp cannot spin.
 */
export function workingMinutesBetween(cfg: RepConfig, fromMs: number, toMs: number): number {
  if (!(toMs > fromMs)) return 0;
  const start = hhmmToMinutes(cfg.workStartIst);
  const end = hhmmToMinutes(cfg.workEndIst);
  if (!(end > start) || cfg.workDays.length === 0) return 0;

  let total = 0;
  let { dayStartMs } = istParts(fromMs);
  for (let guard = 0; guard < 370 && dayStartMs < toMs; guard++, dayStartMs += DAY_MS) {
    const { isoDay } = istParts(dayStartMs + 12 * 3600_000); // midday: never ambiguous
    if (!cfg.workDays.includes(isoDay)) continue;
    const winOpen = dayStartMs + start * 60_000;
    const winShut = dayStartMs + end * 60_000;
    const lo = Math.max(winOpen, fromMs);
    const hi = Math.min(winShut, toMs);
    if (hi > lo) total += (hi - lo) / 60_000;
  }
  return Math.round(total);
}

/**
 * The wall-clock instant by which first contact is due — the moment at which
 * `slaMinutes` of this rep's working time have elapsed since assignment.
 * Returns null if the rep has no workable week at all (nothing is ever due,
 * and pretending otherwise would flag them permanently).
 */
export function firstContactDueAt(cfg: RepConfig, assignedAtMs: number): number | null {
  const start = hhmmToMinutes(cfg.workStartIst);
  const end = hhmmToMinutes(cfg.workEndIst);
  if (!(end > start) || cfg.workDays.length === 0) return null;

  let remaining = cfg.firstContactSlaMinutes;
  let { dayStartMs } = istParts(assignedAtMs);
  for (let guard = 0; guard < 370; guard++, dayStartMs += DAY_MS) {
    const { isoDay } = istParts(dayStartMs + 12 * 3600_000);
    if (!cfg.workDays.includes(isoDay)) continue;
    const winOpen = dayStartMs + start * 60_000;
    const winShut = dayStartMs + end * 60_000;
    const lo = Math.max(winOpen, assignedAtMs);
    if (winShut <= lo) continue;
    const availableMin = (winShut - lo) / 60_000;
    if (availableMin >= remaining) return lo + remaining * 60_000;
    remaining -= availableMin;
  }
  return null;
}

export type SlaState =
  /** No assignment time recorded — rows predating 28 Aug 2026. NOT "on time". */
  | { state: 'unknown' }
  | { state: 'awaiting'; workingMinutesElapsed: number; breached: boolean; dueAtMs: number | null }
  | { state: 'contacted'; workingMinutesTaken: number; breached: boolean };

/**
 * Where one lead stands against its first-contact SLA. Pure.
 *
 * `unknown` is a first-class answer and the reason this returns a union rather
 * than a boolean. A lead assigned before the column existed has no start time,
 * and reporting it as either "on time" or "breached" would be inventing
 * history — the founder's data-quality panel counts these separately, exactly
 * as the migration's column comment requires.
 */
export function firstContactSla(
  cfg: RepConfig,
  lead: { assignedAt: string | null; firstContactAt: string | null },
  nowMs: number,
): SlaState {
  if (!lead.assignedAt) return { state: 'unknown' };
  const assignedMs = Date.parse(lead.assignedAt);
  if (Number.isNaN(assignedMs)) return { state: 'unknown' };

  if (lead.firstContactAt) {
    const contactedMs = Date.parse(lead.firstContactAt);
    if (Number.isNaN(contactedMs)) return { state: 'unknown' };
    const taken = workingMinutesBetween(cfg, assignedMs, contactedMs);
    return { state: 'contacted', workingMinutesTaken: taken, breached: taken > cfg.firstContactSlaMinutes };
  }

  const elapsed = workingMinutesBetween(cfg, assignedMs, nowMs);
  return {
    state: 'awaiting',
    workingMinutesElapsed: elapsed,
    breached: elapsed > cfg.firstContactSlaMinutes,
    dueAtMs: firstContactDueAt(cfg, assignedMs),
  };
}

export interface SlaTally {
  awaiting: number;
  /** Uncalled and already past the SLA — the queue-jumping list. */
  breached: number;
  contactedInTime: number;
  contactedLate: number;
  /** Assigned before we recorded assignment times. Reported, never assumed. */
  unknown: number;
}

export function tallySla(
  cfg: RepConfig,
  leads: Array<{ assignedAt: string | null; firstContactAt: string | null }>,
  nowMs: number,
): SlaTally {
  const out: SlaTally = { awaiting: 0, breached: 0, contactedInTime: 0, contactedLate: 0, unknown: 0 };
  for (const l of leads) {
    const s = firstContactSla(cfg, l, nowMs);
    if (s.state === 'unknown') out.unknown++;
    else if (s.state === 'awaiting') { out.awaiting++; if (s.breached) out.breached++; }
    else if (s.breached) out.contactedLate++;
    else out.contactedInTime++;
  }
  return out;
}
