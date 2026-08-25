// ── Bookable slots ──────────────────────────────────────────────────────────
//
// Pure. Availability + what is already booked + now, in; the times a student
// may actually choose, out. No database, no clock of its own, so every rule
// below is testable and none of them can quietly disagree with the database.
//
// THE DIVISION OF LABOUR, deliberately:
//   this module  — computes what to OFFER (fast, read-only, may be stale)
//   the database — decides what is ACCEPTED (the exclusion constraint and the
//                  availability trigger, migration 20260824h)
//
// Those are different jobs and it matters that they stay different. Two
// students can load a slot list at the same moment and both be offered 11:00;
// only one insert can win, and the loser must be told cleanly rather than
// silently double-booking a mentor. A slot list is an INVITATION, never a
// reservation — which is why nothing here writes anything.

export interface Availability {
  timezone: string;
  /** ISO weekdays, 1 = Monday … 7 = Sunday. */
  workDays: readonly number[];
  /** Minutes from local midnight. */
  startMinute: number;
  endMinute: number;
  slotMinutes: number;
  bufferMinutes: number;
  maxPerDay: number | null;
  horizonDays: number;
  minNoticeMinutes: number;
  active: boolean;
}

/** A span already taken on the mentor's calendar, in epoch ms. */
export interface BusySpan {
  startMs: number;
  endMs: number;
}

export interface Slot {
  /** Start of the session, ISO. */
  startIso: string;
  startMs: number;
  endMs: number;
  /** Local label for display, e.g. "11:00 am". */
  label: string;
  /** Local day key, e.g. "2026-08-26". */
  day: string;
}

const MIN = 60_000;
const DAY = 86_400_000;

/**
 * The local wall-clock offset for a timezone at a given instant, in minutes.
 *
 * Computed from Intl rather than hardcoded to +5:30. Every mentor today is in
 * IST, but a hardcoded offset is how a system silently books a 3am call the
 * first time that stops being true — and IST is exactly the kind of "it never
 * changes" assumption that hides the bug until it is expensive.
 */
export function offsetMinutes(tz: string, atMs: number): number {
  const d = new Date(atMs);
  // 'en-CA' gives YYYY-MM-DD; sv-SE style parts keep this locale-independent.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(
    get('year'), get('month') - 1, get('day'),
    get('hour') % 24, get('minute'), get('second'),
  );
  return Math.round((asUtc - Math.floor(atMs / 1000) * 1000) / MIN);
}

/** Local day key (YYYY-MM-DD) for an instant in a timezone. */
export function localDay(tz: string, atMs: number): string {
  return new Date(atMs).toLocaleDateString('en-CA', { timeZone: tz });
}

/** ISO weekday (1..7) for an instant in a timezone. */
export function localWeekday(tz: string, atMs: number): number {
  const wd = new Date(atMs).toLocaleDateString('en-US', { timeZone: tz, weekday: 'short' });
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return map[wd] ?? 1;
}

function label(tz: string, atMs: number): string {
  return new Date(atMs).toLocaleTimeString('en-IN', {
    timeZone: tz, hour: 'numeric', minute: '2-digit',
  });
}

/**
 * Every slot a student may choose.
 *
 * Rules applied here, each one also enforced by the database:
 *   · only on the mentor's working days, inside their hours
 *   · the whole session must FIT before closing time — a 45-minute slot at
 *     18:45 against a 19:00 close is not a slot, it is an overrun
 *   · never inside another session's span, INCLUDING that session's buffer
 *   · never during time off
 *   · not sooner than the mentor's notice period
 *   · not further out than their horizon
 *   · not past a day that is already at max_per_day
 */
export function generateSlots(
  a: Availability,
  busy: readonly BusySpan[],
  nowMs: number,
): Slot[] {
  if (!a.active) return [];
  if (a.workDays.length === 0) return [];
  if (a.slotMinutes <= 0 || a.endMinute <= a.startMinute) return [];

  const earliest = nowMs + a.minNoticeMinutes * MIN;
  const latest = nowMs + a.horizonDays * DAY;
  const workDays = new Set(a.workDays);

  // How many sessions already sit on each local day, so max_per_day is applied
  // to the mentor's day rather than to a rolling 24 hours.
  const bookedPerDay = new Map<string, number>();
  for (const b of busy) {
    const d = localDay(a.timezone, b.startMs);
    bookedPerDay.set(d, (bookedPerDay.get(d) ?? 0) + 1);
  }

  const slots: Slot[] = [];
  // Walk local days from today to the horizon. Iterating days rather than
  // fixed 24h steps keeps this correct across a DST change, where a "day" is
  // 23 or 25 hours long.
  for (let dayOffset = 0; dayOffset <= a.horizonDays; dayOffset += 1) {
    const probe = nowMs + dayOffset * DAY;
    const day = localDay(a.timezone, probe);
    if (!workDays.has(localWeekday(a.timezone, probe))) continue;

    const alreadyToday = bookedPerDay.get(day) ?? 0;
    if (a.maxPerDay != null && alreadyToday >= a.maxPerDay) continue;
    let placedToday = 0;

    // Midnight local, expressed as an instant.
    const [y, m, d] = day.split('-').map(Number);
    const naiveMidnightUtc = Date.UTC(y, m - 1, d, 0, 0, 0);
    const off = offsetMinutes(a.timezone, naiveMidnightUtc);
    const midnightMs = naiveMidnightUtc - off * MIN;

    // The step is slot + buffer: the next time a mentor could actually start,
    // not the next time the clock is round.
    const step = (a.slotMinutes + a.bufferMinutes) * MIN;

    for (let mins = a.startMinute; mins + a.slotMinutes <= a.endMinute; mins += step / MIN) {
      const startMs = midnightMs + mins * MIN;
      const endMs = startMs + a.slotMinutes * MIN;

      if (startMs < earliest) continue;
      if (startMs > latest) break;
      if (a.maxPerDay != null && alreadyToday + placedToday >= a.maxPerDay) break;

      // The offered slot must not collide with an existing span. The busy
      // spans already carry their own buffer (the DB bakes it in), and this
      // slot must also leave ITS buffer clear afterwards.
      const guardEnd = endMs + a.bufferMinutes * MIN;
      const clash = busy.some((b) => b.startMs < guardEnd && startMs < b.endMs);
      if (clash) continue;

      slots.push({ startIso: new Date(startMs).toISOString(), startMs, endMs, day, label: label(a.timezone, startMs) });
      placedToday += 1;
    }
  }

  return slots;
}

/** Group slots by local day, for a picker that shows a day at a time. */
export function slotsByDay(slots: readonly Slot[]): { day: string; slots: Slot[] }[] {
  const map = new Map<string, Slot[]>();
  for (const s of slots) {
    const a = map.get(s.day);
    if (a) a.push(s); else map.set(s.day, [s]);
  }
  return [...map.entries()].map(([day, list]) => ({ day, slots: list }))
    .sort((x, y) => x.day.localeCompare(y.day));
}
