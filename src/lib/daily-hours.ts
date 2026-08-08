// ── The student's daily hours. One number, one owner, one place it changes. ──
//
// Founder, 6 Aug: "keep one thing fixed, that is daily hours. Students usually
// study the same number of hours only — they can't significantly change daily
// study hours unless there is a human intervention by the students themselves.
// One number, one owner, one place it can change... zero mismatch."
//
// The mismatch this module exists to end: a student set 11 hours and their plan
// showed 4. Both numbers were computed correctly, by five different pieces of
// code, from three different inputs:
//
//   · study_target_hours  — what the student typed
//   · hours_available     — an older copy of the same thing, updated by a
//                           different set of writers, so routinely stale
//   · requiredPerDay      — remaining syllabus ÷ days to their finish date,
//                           i.e. what the DATE demands, which is not a thing
//                           the student ever agreed to
//   · capBudget(...)      — the above, shrunk toward logged behaviour
//   · volumeFactor        — and then the task count scaled ±30% on top
//
// Every layer was defensible on its own. Together they meant no two surfaces
// showed the same number, and none of them showed the student's.
//
// The rule now:
//
//   THE NUMBER   study_target_hours (weekday) + weekend_hours_available.
//   THE OWNER    the student. Nothing in this codebase may derive, cap, trim,
//                round toward behaviour, or otherwise "improve" it.
//   THE CHANGE   only through setDailyHours() below, only from a request the
//                student themselves made.
//
// When the student falls behind, the consequence is the FINISH DATE, moved once
// a week with the arithmetic attached (lib/plan-extension.ts). The date gives.
// The hours don't.

/**
 * The range. One ceiling, and it is a sanity bound, NOT a policy cap.
 *
 * There was briefly a second, lower "what a student may choose" ceiling here.
 * The founder killed it, 6 Aug: "I completely agree with students who choose 12
 * hours or 15 hours — I used to study 15 hours — so yes, let them build that.
 * They might be the sincere students."
 *
 * He is right, and a second ceiling would have quietly recreated the exact
 * problem this module exists to solve: a number the student can hold but not
 * pick is a number the app has an opinion about. Anything storable is
 * choosable. The app's job is to hold the number, not to judge it.
 */
export const MIN_DAILY_HOURS = 0.5;
export const MAX_DAILY_HOURS = 16;

/**
 * The options a picker shows: the whole range, plus whatever the student is on
 * now even if it is a half hour that no button represents.
 */
export function hourOptions(current: number | null): number[] {
  const opts = Array.from({ length: MAX_DAILY_HOURS }, (_, i) => i + 1);
  if (current != null && !opts.includes(current)) opts.push(current);
  return opts.sort((a, b) => a - b);
}

/** How the current value got there — so we can always answer "who set this?". */
export type HoursSource = 'student' | 'signup' | 'derived_legacy' | null;

/** The columns this module reads. Anything with these fields will do. */
export interface HoursProfile {
  study_target_hours?: unknown;
  hours_available?: unknown;
  weekend_hours_available?: unknown;
  study_hours_source?: unknown;
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Round to the nearest half hour and hold inside the slider's range.
 *
 * The ONLY transformation allowed on a student's number, and only at the moment
 * they set it — never afterwards, and never on the way out to a surface.
 */
export function normaliseHours(input: unknown): number | null {
  const n = num(input);
  if (n == null) return null;
  return Math.min(MAX_DAILY_HOURS, Math.max(MIN_DAILY_HOURS, Math.round(n * 2) / 2));
}

/**
 * The student's daily hours, weekday and weekend.
 *
 * `hours_available` is the legacy duplicate: read as a fallback for accounts
 * that predate study_target_hours, never as a source of truth, and never
 * written by anything but setDailyHours(). It is on its way out.
 *
 * Both can be null — a brand-new account that has not answered yet. Callers
 * must handle that rather than substituting a number of their own; the routine
 * engine has archetype fallbacks for exactly this and they are the only ones.
 */
export function dailyHours(p: HoursProfile | null | undefined): {
  weekday: number | null;
  weekend: number | null;
} {
  const weekday = num(p?.study_target_hours) ?? num(p?.hours_available);
  // A student who never set a separate weekend figure studies their usual day
  // at the weekend too. Falling back to the weekday number keeps one number
  // on screen instead of two that disagree.
  const weekend = num(p?.weekend_hours_available) ?? weekday;
  return { weekday, weekend };
}

/** The number today's plan is built to. `isWeekend` decides which one. */
export function hoursForDay(p: HoursProfile | null | undefined, isWeekend: boolean): number | null {
  const h = dailyHours(p);
  return isWeekend ? h.weekend : h.weekday;
}

/**
 * Does this student need to confirm the number is theirs?
 *
 * Until 6 Aug, rescheduling the finish date silently rewrote study_target_hours
 * to whatever the new date demanded. That write left no trace, so for existing
 * accounts we cannot tell a number the student chose from one we imposed — the
 * original value is not recoverable from anything we stored.
 *
 * Founder's call: "any confusion for any student, ask them the question in app
 * and then act, or confirm from them." So we ask, exactly once, and from then
 * on the number is provably theirs. `study_hours_source = 'student'` is that
 * proof, and it is the only thing that makes this prompt go away.
 */
export function needsHoursConfirmation(p: HoursProfile | null | undefined): boolean {
  if (!p) return false;
  if (p.study_hours_source === 'student') return false; // already theirs, on the record
  return dailyHours(p).weekday != null;                 // nothing to confirm if unset
}

/**
 * The profile patch that sets daily hours. THE only writer.
 *
 * Nothing else in the codebase may put study_target_hours in an update object.
 * A guard test greps for that (daily-hours.test.ts) — if it fails, someone has
 * started deriving the student's number again and the mismatch is back.
 *
 * `weekend` is only written when the caller genuinely collected one. Passing
 * undefined leaves the student's existing weekend figure alone; the surfaces
 * fall back to the weekday number on their own via dailyHours().
 */
export function setDailyHours(
  weekday: number,
  source: Exclude<HoursSource, null>,
  weekend?: number | null
): Record<string, unknown> {
  const h = normaliseHours(weekday);
  if (h == null) return {};
  const patch: Record<string, unknown> = {
    study_target_hours: h,
    // Kept in lock-step only because a handful of exports and CRM payloads
    // still select it. It is a mirror, never an input.
    hours_available: Math.round(h),
    study_hours_source: source,
    study_hours_set_at: new Date().toISOString(),
  };
  if (weekend !== undefined) {
    const w = weekend == null ? null : normaliseHours(weekend);
    patch.weekend_hours_available = w == null ? null : Math.round(w);
  }
  return patch;
}

// ── The bad-day floor (Stage A, founder 8 Aug) ──────────────────────────────
//
// A second number now lives beside the hours, and it means something
// different. The FLOOR sizes the daily plan: "on a bad day, how much can you
// still do?" — 15, 30, 60 or 120 minutes. The plan is BUILT at this size, so
// finishing it is normal, not a miracle; a "want more?" tap adds the next
// block. The TARGET (study_target_hours above) keeps feeding pace and the
// Sunday finish-date arithmetic once the student sets it — it is no longer
// asked at signup, because our churn data showed signup hours are fantasy
// (students chose 11–15h, did 2–6h, and the oversized plan stood as daily
// proof of failure until they left).
//
// Same ownership rules as the hours: the student's number, set only here,
// never derived, never "improved". The guard test greps the tree for stray
// writers of this column too.

/** The four floor choices. Small on purpose — the day must be winnable. */
export const FLOOR_OPTIONS_MINUTES = [15, 30, 60, 120] as const;

export interface FloorProfile { bad_day_floor_minutes?: unknown }

/**
 * The floor in minutes, or null for accounts from before it existed.
 * Null means: plan exactly as today (hours-based) — old students feel no
 * change until they choose a floor themselves.
 */
export function badDayFloorMinutes(p: FloorProfile | null | undefined): number | null {
  const n = num(p?.bad_day_floor_minutes);
  if (n == null) return null;
  // Snap to the nearest allowed option — anything storable is choosable, but
  // the floor's whole point is smallness, so it stays within the four choices.
  return FLOOR_OPTIONS_MINUTES.reduce((best, opt) =>
    Math.abs(opt - n) < Math.abs(best - n) ? opt : best, FLOOR_OPTIONS_MINUTES[0] as number);
}

/**
 * The minutes today's plan is built to. Floor when the student has one;
 * their hours otherwise (legacy behaviour, unchanged); null when neither —
 * the routine engine's archetype fallbacks remain the only substitutes.
 */
export function planMinutesForDay(
  p: (HoursProfile & FloorProfile) | null | undefined,
  isWeekend: boolean
): number | null {
  const floor = badDayFloorMinutes(p);
  if (floor != null) return floor;
  const h = hoursForDay(p, isWeekend);
  return h == null ? null : Math.round(h * 60);
}

/** The profile patch that sets the floor. THE only writer, same as hours. */
export function setBadDayFloor(minutes: number): Record<string, unknown> {
  const n = num(minutes);
  if (n == null) return {};
  const snapped = FLOOR_OPTIONS_MINUTES.reduce((best, opt) =>
    Math.abs(opt - n) < Math.abs(best - n) ? opt : best, FLOOR_OPTIONS_MINUTES[0] as number);
  return {
    bad_day_floor_minutes: snapped,
    bad_day_floor_set_at: new Date().toISOString(),
  };
}
