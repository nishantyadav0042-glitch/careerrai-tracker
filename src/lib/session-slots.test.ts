import { describe, it, expect } from 'vitest';
import {
  generateSlots, slotsByDay, offsetMinutes, localDay, localWeekday,
  offeredSlotProblem,
  type Availability, type BusySpan,
} from './session-slots';

// A slot list is an INVITATION, not a reservation. These tests protect the
// rules that decide what a student is allowed to be offered — every one of
// which is also enforced by the database (migration 20260824h), because a
// student who is offered a slot the database will refuse has been lied to.

const IST = 'Asia/Kolkata';

const avail = (o: Partial<Availability> = {}): Availability => ({
  timezone: IST,
  workDays: [1, 2, 3, 4, 5],
  startMinute: 10 * 60,   // 10:00
  endMinute: 19 * 60,     // 19:00
  slotMinutes: 45,
  bufferMinutes: 15,
  maxPerDay: null,
  horizonDays: 14,
  minNoticeMinutes: 120,
  active: true,
  ...o,
});

// Monday 25 Aug 2026, 04:00 IST (22:30 UTC Sunday) — well before the working day.
const MON_EARLY = Date.parse('2026-08-24T22:30:00Z');

describe('timezone handling is computed, never assumed', () => {
  it('derives the IST offset rather than hardcoding +5:30', () => {
    expect(offsetMinutes(IST, MON_EARLY)).toBe(330);
  });

  it('handles a timezone that actually observes DST', () => {
    // The reason the offset is computed at all: this one changes.
    const jan = Date.parse('2026-01-15T12:00:00Z');
    const jul = Date.parse('2026-07-15T12:00:00Z');
    expect(offsetMinutes('America/New_York', jan)).toBe(-300);
    expect(offsetMinutes('America/New_York', jul)).toBe(-240);
  });

  it('reports the local day and weekday, not the UTC ones', () => {
    // 22:30 UTC Sunday is already Monday morning in IST. A UTC weekday here
    // would offer Sunday slots to a mentor who does not work Sundays.
    const t = Date.parse('2026-08-24T22:30:00Z');
    expect(localDay(IST, t)).toBe('2026-08-25');
    expect(localWeekday(IST, t)).toBe(2); // Tuesday
  });
});

describe('slots respect the mentor’s week', () => {
  it('offers nothing outside working hours', () => {
    const slots = generateSlots(avail(), [], MON_EARLY);
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      const local = new Date(s.startMs).toLocaleTimeString('en-GB', { timeZone: IST, hour12: false });
      const mins = Number(local.slice(0, 2)) * 60 + Number(local.slice(3, 5));
      expect(mins).toBeGreaterThanOrEqual(10 * 60);
      // The whole session must fit before closing.
      expect(mins + 45).toBeLessThanOrEqual(19 * 60);
    }
  });

  it('never offers a session that would overrun closing time', () => {
    // 10:00-11:00 with a 45-minute slot allows exactly one start, at 10:00.
    const slots = generateSlots(avail({ startMinute: 600, endMinute: 660 }), [], MON_EARLY);
    for (const s of slots) expect(s.endMs - s.startMs).toBe(45 * 60_000);
    const firstDay = slotsByDay(slots)[0];
    expect(firstDay.slots.length).toBe(1);
  });

  it('offers nothing on a non-working day', () => {
    const sundayOnly = generateSlots(avail({ workDays: [7] }), [], MON_EARLY);
    for (const s of sundayOnly) expect(localWeekday(IST, s.startMs)).toBe(7);
  });

  it('an inactive mentor offers nothing at all', () => {
    expect(generateSlots(avail({ active: false }), [], MON_EARLY)).toEqual([]);
  });

  it('a mentor with no working days offers nothing', () => {
    expect(generateSlots(avail({ workDays: [] }), [], MON_EARLY)).toEqual([]);
  });
});

describe('the buffer is real, not decorative', () => {
  it('consecutive offered slots are a full slot + buffer apart', () => {
    const day = slotsByDay(generateSlots(avail(), [], MON_EARLY))[0];
    expect(day.slots.length).toBeGreaterThan(1);
    for (let i = 1; i < day.slots.length; i += 1) {
      expect(day.slots[i].startMs - day.slots[i - 1].startMs).toBe(60 * 60_000);
    }
  });

  it('a booked session blocks the slot that would start inside its buffer', () => {
    const all = generateSlots(avail(), [], MON_EARLY);
    const target = all[0];
    // The DB bakes the buffer into the busy span, so mirror that here.
    const busy: BusySpan[] = [{ startMs: target.startMs, endMs: target.endMs + 15 * 60_000 }];
    const after = generateSlots(avail(), busy, MON_EARLY);
    expect(after.some((s) => s.startMs === target.startMs)).toBe(false);
  });

  it('leaves the NEXT slot free once the buffer has elapsed', () => {
    const all = generateSlots(avail(), [], MON_EARLY);
    const [first, second] = all;
    const busy: BusySpan[] = [{ startMs: first.startMs, endMs: first.endMs + 15 * 60_000 }];
    const after = generateSlots(avail(), busy, MON_EARLY);
    expect(after.some((s) => s.startMs === second.startMs)).toBe(true);
  });

  it('a slot is not offered if ITS buffer would run into an existing session', () => {
    const all = generateSlots(avail(), [], MON_EARLY);
    const second = all[1];
    // A session starting 10 minutes after `second` ends: `second` itself is
    // still fine, but a slot whose own buffer overlaps it must not be offered.
    const busy: BusySpan[] = [{ startMs: second.endMs + 10 * 60_000, endMs: second.endMs + 55 * 60_000 }];
    const after = generateSlots(avail(), busy, MON_EARLY);
    expect(after.some((s) => s.startMs === second.startMs)).toBe(false);
  });
});

describe('notice and horizon bound the list', () => {
  it('never offers a slot sooner than the notice period', () => {
    const slots = generateSlots(avail({ minNoticeMinutes: 24 * 60 }), [], MON_EARLY);
    for (const s of slots) expect(s.startMs).toBeGreaterThanOrEqual(MON_EARLY + 24 * 60 * 60_000);
  });

  it('never offers a slot past the horizon', () => {
    const slots = generateSlots(avail({ horizonDays: 3 }), [], MON_EARLY);
    for (const s of slots) expect(s.startMs).toBeLessThanOrEqual(MON_EARLY + 3 * 86_400_000);
  });

  it('a zero-notice mentor can still be booked today', () => {
    const slots = generateSlots(avail({ minNoticeMinutes: 0 }), [], MON_EARLY);
    expect(slots.some((s) => s.day === localDay(IST, MON_EARLY))).toBe(true);
  });
});

describe('max_per_day is a limit on a human being', () => {
  it('stops offering a day once it is full', () => {
    const a = avail({ maxPerDay: 2 });
    const byDay = slotsByDay(generateSlots(a, [], MON_EARLY));
    for (const d of byDay) expect(d.slots.length).toBeLessThanOrEqual(2);
  });

  it('counts sessions ALREADY booked that day toward the limit', () => {
    const a = avail({ maxPerDay: 2 });
    const first = generateSlots(a, [], MON_EARLY)[0];
    const busy: BusySpan[] = [{ startMs: first.startMs, endMs: first.endMs + 15 * 60_000 }];
    const byDay = slotsByDay(generateSlots(a, busy, MON_EARLY));
    const sameDay = byDay.find((d) => d.day === first.day);
    // One already booked, so at most one more may be offered.
    expect(sameDay ? sameDay.slots.length : 0).toBeLessThanOrEqual(1);
  });

  it('null max_per_day means no explicit limit, never zero', () => {
    expect(generateSlots(avail({ maxPerDay: null }), [], MON_EARLY).length).toBeGreaterThan(5);
  });
});

describe('the list is well-formed', () => {
  it('every slot carries a usable label and a valid ISO start', () => {
    for (const s of generateSlots(avail(), [], MON_EARLY).slice(0, 20)) {
      expect(s.label).toMatch(/\d/);
      expect(s.label).not.toContain('Invalid');
      expect(Number.isNaN(Date.parse(s.startIso))).toBe(false);
      expect(s.endMs).toBeGreaterThan(s.startMs);
    }
  });

  it('slots are strictly increasing and never duplicated', () => {
    const slots = generateSlots(avail(), [], MON_EARLY);
    const times = slots.map((s) => s.startMs);
    expect(new Set(times).size).toBe(times.length);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('grouping by day preserves every slot', () => {
    const slots = generateSlots(avail(), [], MON_EARLY);
    expect(slotsByDay(slots).reduce((n, d) => n + d.slots.length, 0)).toBe(slots.length);
  });

  it('a fully booked mentor offers an empty list, not a crash', () => {
    const all = generateSlots(avail(), [], MON_EARLY);
    const busy = all.map((s) => ({ startMs: s.startMs, endMs: s.endMs + 15 * 60_000 }));
    expect(generateSlots(avail(), busy, MON_EARLY)).toEqual([]);
  });
});

describe('this module offers, it never reserves', () => {
  it('performs no writes and holds no database client', async () => {
    const fs = await import('node:fs');
    const code = fs.readFileSync('src/lib/session-slots.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    // Two students may be offered the same slot; only the DB decides who gets
    // it. If this file could write, that race would move here, where there is
    // no constraint to lose it against.
    for (const banned of [/\.insert\s*\(/, /\.update\s*\(/, /\.rpc\s*\(/, /createAdminClient/, /\bfetch\s*\(/]) {
      expect(code, `session-slots acquired a write path: ${banned}`).not.toMatch(banned);
    }
  });
});

// ── offeredSlotProblem — the door a RESCHEDULE has to pass ──────────────────
//
// 27 Aug. calendar/reschedule-meeting moved sessions with no availability
// check at all: it validated that the new time parsed, was in the future, and
// had a legal duration, then wrote it. A mentor could move a student onto a
// Sunday, to 3am, or into their own time off.
//
// It survived review because the table looked guarded. Two triggers sit on
// video_sessions and only one reaches an UPDATE:
//   set_video_session_span                  insert OR UPDATE → overlap caught
//   video_session_within_availability_guard insert ONLY      → the hole
// The rules existed; they were attached to the wrong verb.
describe('offeredSlotProblem — a reschedule must land on a real offer', () => {
  // Monday 24 Aug 2026, 10:00 IST. A working day inside working hours.
  const MON_10 = Date.parse('2026-08-24T04:30:00Z');
  const now = MON_10 - 6 * 60 * 60_000; // 04:00 IST Monday, past the 120m notice

  it('accepts a time the mentor is actually offering', () => {
    expect(offeredSlotProblem(avail(), [], MON_10, 45, now)).toBeNull();
  });

  it('refuses a day the mentor does not work', () => {
    // Sunday 23 Aug 2026, 10:00 IST — one day earlier, everything else equal.
    const sun10 = MON_10 - 86_400_000;
    expect(offeredSlotProblem(avail(), [], sun10, 45, now - 86_400_000))
      .toBe('not_offered');
  });

  it('refuses a time outside the mentor’s hours', () => {
    // 03:00 IST Monday. Inside the horizon, on a working day, still not a slot.
    const mon03 = Date.parse('2026-08-23T21:30:00Z');
    expect(offeredSlotProblem(avail(), [], mon03, 45, now - 6 * 60 * 60_000))
      .toBe('not_offered');
  });

  it('refuses a slot that is not on the mentor’s grid', () => {
    // 10:20 IST — twenty minutes into a real slot is not a real slot.
    expect(offeredSlotProblem(avail(), [], MON_10 + 20 * 60_000, 45, now))
      .toBe('not_offered');
  });

  it('refuses a time already taken, including its buffer', () => {
    const busy: BusySpan[] = [
      { startMs: MON_10, endMs: MON_10 + (45 + 15) * 60_000 },
    ];
    expect(offeredSlotProblem(avail(), busy, MON_10, 45, now)).toBe('not_offered');
  });

  it('refuses a move inside the mentor’s notice period', () => {
    // now = 09:00 IST for a 10:00 slot, against a 120-minute notice.
    const tooSoon = MON_10 - 60 * 60_000;
    expect(offeredSlotProblem(avail(), [], MON_10, 45, tooSoon)).toBe('not_offered');
  });

  it('refuses a move beyond the mentor’s horizon', () => {
    const farOut = MON_10 + 30 * 86_400_000;
    expect(offeredSlotProblem(avail({ horizonDays: 14 }), [], farOut, 45, now))
      .toBe('not_offered');
  });

  // THE CASE generateSlots CANNOT SEE. It measures the end-of-day fit against
  // the mentor's own slot length, so a reschedule that also LENGTHENS the
  // session starts on a genuine slot and finishes after closing time. The
  // database checks this with the real duration — on insert, which a
  // reschedule never reaches.
  it('refuses a longer session that starts on a real slot but overruns the day', () => {
    // Last 30-minute slot of an 18:30-close day, stretched to 60 minutes.
    const a = avail({ slotMinutes: 30, bufferMinutes: 0, endMinute: 18 * 60 + 30 });
    const mon1800 = Date.parse('2026-08-24T12:30:00Z'); // 18:00 IST
    expect(offeredSlotProblem(a, [], mon1800, 30, now)).toBeNull();
    expect(offeredSlotProblem(a, [], mon1800, 60, now)).toBe('overruns_day');
  });

  it('refuses everything while the mentor is not taking bookings', () => {
    expect(offeredSlotProblem(avail({ active: false }), [], MON_10, 45, now))
      .toBe('not_offered');
  });
});
