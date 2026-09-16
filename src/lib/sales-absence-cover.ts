// ── WHEN A COUNSELLOR IS NOT THERE, THEIR STUDENTS STILL ARE ────────────────
//
// Neelam was away 12, 13 and 14 September. Her **583 students got nothing for
// three days**, and Anshul could not have reached them if he had wanted to:
// ownership is exclusive, so an owned lead is invisible to every other seat.
// Nobody noticed until the books were counted a day later.
//
// `sales_rep_config.unavailable_until` already existed and already worked —
// for INTAKE. It stops new students entering an absent seat's book. It does
// nothing about the book that is already there, which is the half that
// matters: the students are owned, so they are nobody else's to call, and they
// simply wait.
//
// This decides who is absent TODAY and who covers for them. Two rules, and the
// second is the one that catches a real day:
//
//   1. DECLARED — `unavailable_until` covers today. Planned leave.
//   2. OBSERVED — the shift is well under way and not one card has been
//      marked. A counsellor who logs in at four and works until nine is not
//      absent at 15:20; one who has marked nothing by 17:30 is not working
//      today, whatever the config says. Neelam's three days were all of this
//      kind: no leave was ever recorded.
//
// WHAT COVER IS, AND IS NOT. Cover grants ACCESS for the rest of that day. It
// does not move ownership, does not write anything, and expires at midnight
// on its own. The founder's instruction, 16 Sep: *"ownership nahi badalti —
// sirf us din ka access"*. A rep who comes back tomorrow finds their book
// exactly as they left it, which is the whole point: a book is a relationship,
// and cutting it while somebody is ill is how you lose the person as well as
// the students.
//
// And cover is never shared. An absent seat's students go to exactly ONE
// covering seat, chosen the same deterministic way an unclaimed student is
// (lib/sales-unclaimed-owner) — otherwise "zero mixup between reps" is undone
// on precisely the days nobody is watching.

/** Hours into the shift after which silence means absence, not a late start. */
export const COVER_AFTER_SHIFT_HOURS = 2.5;

export interface SeatDay {
  repId: string;
  active: boolean;
  /** 'HH:MM:SS' IST, from sales_rep_config.work_start_ist. */
  workStartIst: string | null;
  /** ISO date 'YYYY-MM-DD' through which the seat is on declared leave. */
  unavailableUntil: string | null;
  /** Cards this seat has MARKED today. Zero is the observed-absence signal. */
  workedToday: number;
  /** IST weekday numbers the seat works, from work_days. */
  workDays: number[] | null;
}

function minutesIntoShift(workStartIst: string | null, nowIstMinutes: number): number | null {
  if (!workStartIst) return null;
  const [h, m] = workStartIst.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return nowIstMinutes - (h * 60 + m);
}

/** IST minutes-since-midnight and weekday (1=Mon … 7=Sun) for an instant. */
export function istClock(nowMs: number): { minutes: number; weekday: number } {
  const ist = new Date(nowMs + 5.5 * 3_600_000);
  const weekday = ((ist.getUTCDay() + 6) % 7) + 1;
  return { minutes: ist.getUTCHours() * 60 + ist.getUTCMinutes(), weekday };
}

/**
 * Is this seat absent today?
 *
 * Returns false for a seat that is simply not scheduled today — a Sunday is
 * not an absence, and covering it would hand one rep both books every week.
 */
export function isAbsentToday(seat: SeatDay, nowMs: number, todayIst: string): boolean {
  if (!seat.active) return false;                 // an inactive seat has no book to cover
  const { minutes, weekday } = istClock(nowMs);
  if (seat.workDays && seat.workDays.length > 0 && !seat.workDays.includes(weekday)) return false;

  // Declared leave. A date, not a flag: an expired one passes.
  if (seat.unavailableUntil && seat.unavailableUntil >= todayIst) return true;

  // Observed silence, but only once the shift has genuinely started.
  if (seat.workedToday > 0) return false;
  const into = minutesIntoShift(seat.workStartIst, minutes);
  if (into == null) return false;                 // no configured start — never guess
  return into >= COVER_AFTER_SHIFT_HOURS * 60;
}

/**
 * Which absent seats' books this viewer covers right now.
 *
 * Empty for an absent viewer: somebody who is not working today does not pick
 * up somebody else's book. Empty when every seat is absent, because there is
 * nobody to cover with.
 */
export function coveringFor(
  viewerId: string, seats: readonly SeatDay[], nowMs: number, todayIst: string,
  pick: (absentRepId: string, presentIds: readonly string[]) => string | null,
): string[] {
  const active = seats.filter((s) => s.active);
  const absent = active.filter((s) => isAbsentToday(s, nowMs, todayIst)).map((s) => s.repId);
  if (absent.length === 0) return [];
  const present = active.map((s) => s.repId).filter((id) => !absent.includes(id));
  if (!present.includes(viewerId)) return [];
  // The absent seat's id is the key, so the SAME covering rep is chosen all
  // day and two page loads cannot disagree.
  return absent.filter((absentId) => pick(absentId, present) === viewerId);
}
