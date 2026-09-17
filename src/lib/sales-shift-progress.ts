import { istClock } from '@/lib/sales-absence-cover';

// ── A WORKED COUNT IS NOT A VERDICT UNTIL THE SHIFT IS OVER ─────────────────
//
// Incident #99. On 17 September the founder was told, twice, that a counsellor
// "worked zero cards all day" and that a deck of 154 was "123 cards of
// decoration". Both statements were read off `workedToday` at 17:00 IST.
//
// Both counsellors work **15:00–21:00 IST**. At 17:00 they were two hours into
// a six-hour shift. The first counsellor went on to end the previous day at
// 39 cards; the second was mid-shift at 31 and climbing. Neither number meant
// what it was read to mean, and the same mistake had been made the day before
// on the same field.
//
// Nothing in `sales-control-tower.ts` or `founder-digest.ts` knew a shift
// existed. `sales_rep_config.work_start_ist` / `work_end_ist` were read by
// exactly one module — `sales-absence-cover` — and by nothing the founder
// reads. So the control tower presented a two-hours-in number and a
// day-is-over number in the same column, in the same type, with nothing to
// tell them apart.
//
// This module is the missing denominator. It says nothing about how much a
// counsellor SHOULD do — SALES-OS §0 forbids a target, a quota or a
// performance judgement on any of these surfaces, and `dayComplete` is a fact
// about the clock, not about a person. It only says whether the number beside
// it is finished.

export type ShiftState =
  | 'not_scheduled'  // not one of this seat's working days
  | 'unknown'        // no shift configured — never guess one
  | 'not_started'    // the shift has not begun
  | 'in_progress'    // under way; today's counts are partial
  | 'over';          // finished; today's counts are final

export interface ShiftWindow {
  /** 'HH:MM' or 'HH:MM:SS' IST, from sales_rep_config.work_start_ist. */
  workStartIst: string | null;
  workEndIst: string | null;
  /** IST weekday numbers (1=Mon … 7=Sun), from work_days. */
  workDays: number[] | null;
}

/** No configured window. Named so a caller cannot spell "no shift" three ways. */
export const UNKNOWN_SHIFT: ShiftWindow = { workStartIst: null, workEndIst: null, workDays: null };

export interface ShiftProgress {
  state: ShiftState;
  minutesElapsed: number | null;
  minutesTotal: number | null;
  /**
   * May today's counts be read as the day's answer?
   *
   * A fact about the clock. False while the day can still change, which is the
   * only thing that stopped this being caught: a partial number is not wrong,
   * it is unfinished, and it looks identical either way.
   */
  dayComplete: boolean;
  /** Plain words to sit beside the number. Never a target. */
  label: string;
}

function toMinutes(hhmm: string | null): number | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

const hhmm = (mins: number) =>
  `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

/** "2h20m", "45m" — a duration, deliberately not a rate and not a score. */
export function durationLabel(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? (m > 0 ? `${h}h${m}m` : `${h}h`) : `${m}m`;
}

export function shiftProgress(w: ShiftWindow, nowMs: number): ShiftProgress {
  const none = (state: ShiftState, label: string): ShiftProgress =>
    // `dayComplete` is true for both ends of "nothing more is coming today":
    // a day off is as finished as a shift that ended.
    ({ state, minutesElapsed: null, minutesTotal: null, dayComplete: state !== 'unknown', label });

  const { minutes: now, weekday } = istClock(nowMs);
  if (w.workDays && w.workDays.length > 0 && !w.workDays.includes(weekday)) {
    return none('not_scheduled', 'Not scheduled today');
  }
  const start = toMinutes(w.workStartIst);
  const end = toMinutes(w.workEndIst);
  // No configured shift: say so rather than invent one. A guessed window here
  // would put a confident denominator under a number that has none (L1).
  if (start == null || end == null || end <= start) return none('unknown', 'Shift not configured');

  if (now < start) return { state: 'not_started', minutesElapsed: 0, minutesTotal: end - start, dayComplete: false, label: `Shift starts ${hhmm(start)}` };
  if (now >= end) return { state: 'over', minutesElapsed: end - start, minutesTotal: end - start, dayComplete: true, label: `Shift ended ${hhmm(end)}` };
  return {
    state: 'in_progress',
    minutesElapsed: now - start,
    minutesTotal: end - start,
    dayComplete: false,
    label: `${durationLabel(now - start)} into a ${durationLabel(end - start)} shift`,
  };
}
