/**
 * Streak Calculation Utilities
 * Handles streak tracking, milestone detection, and streak guard logic
 */


// ── Single source of truth for the 3 AM study-day boundary ─────────────────
// A session running past midnight belongs to the previous calendar day
// until 3:00:00 AM IST.  Unit-test edge cases:
//   02:59 IST → previous day   |   03:00 IST → current day
//
// BUG FIX (security/bug audit, 14 July): the old implementation used
// `now.setHours(3,0,0,0)`, which reads/writes in the RUNTIME's local
// timezone — fine in a browser (usually IST for our students), but this
// function is also called from server API routes (routine/today, calibrate,
// complete-task, swap-topic, log-daily, coach-line), which run in UTC on
// Vercel. There, setHours(3) meant 03:00 UTC = 08:30 IST, not 03:00 IST —
// misdating every log/completion made between 3:00–8:30 AM IST onto the
// wrong day, and disagreeing with weekly-diagnosis.ts's correct IST calc.
// Rewritten to be timezone-independent: shift the UTC timestamp by the
// fixed +5:30 IST offset, then only ever read/format via UTC-based methods
// (getUTCHours/toISOString) — never local-time methods — so the result is
// identical no matter what timezone the process itself runs in.
// The implementation moved to study-day.ts — a leaf with zero imports, so
// client components can share this exact rule instead of hand-rolling a UTC
// key (proven output-identical across 12,549 samples spanning 60 days before
// the swap). This module keeps the name the codebase already uses.
import { studyDayString, studyDayStart } from './study-day';
export const getLogDateString = studyDayString;
export { studyDayStart };

// ── Shared constants (import from here — never hardcode elsewhere) ───────────
export const MS_PER_DAY = 86_400_000;

export const VALID_SECTIONS = ['VARC', 'DILR', 'QA', 'Mock', 'Revision'] as const;
export const VALID_ENERGY = ['🙏', '💪', '🔥'] as const;
export const VALID_EMOTIONAL_CHIPS = [
  'mock_scared', 'burned_out', 'comparing',
  'family_pressure', 'lost_confidence', 'feeling_behind', 'all_good',
] as const;

export type ValidSection = (typeof VALID_SECTIONS)[number];
export type ValidEnergy = (typeof VALID_ENERGY)[number];
export type ValidEmotionalChip = (typeof VALID_EMOTIONAL_CHIPS)[number];

export interface StreakData {
  current_streak: number;
  longest_streak: number;
  last_log_date: string | null;
  milestone_sent_7: boolean;
  milestone_sent_21: boolean;
}

/**
 * Calculate if streak is active based on last log date
 * Streak is active if last log was today or yesterday (app 3 AM IST log-day)
 *
 * 20 July fix: this used local-time setHours() — the exact timezone bug the
 * header of this file documents. On Vercel (UTC) "today" started at 5:30 AM
 * IST and ignored the 3 AM boundary. Now derived from getLogDateString, so
 * client and server agree.
 */
export function isStreakActive(lastLogDate: string | null, now: Date = new Date()): boolean {
  if (!lastLogDate) return false;
  const today = getLogDateString(now);
  const y = new Date(today + 'T00:00:00Z');
  y.setUTCDate(y.getUTCDate() - 1);
  const yesterday = y.toISOString().slice(0, 10);
  return lastLogDate === today || lastLogDate === yesterday;
}

/**
 * The streak a student actually HAS right now — 0 if broken.
 *
 * streak_data.current_streak is written at log time and never decays on its
 * own, so any surface reading it raw shows the streak the student HAD at
 * their last log (the 20 July admin contradiction: a "7-day streak" badge on
 * the sales queue for a student who hadn't logged in 2 days, while the
 * dashboard correctly counted him as a streak-breaker). Every DISPLAY of a
 * streak must go through this.
 */
export function liveStreak(
  currentStreak: number | null | undefined,
  lastLogDate: string | null | undefined,
  now: Date = new Date()
): number {
  if (!currentStreak) return 0;
  return isStreakActive(lastLogDate ?? null, now) ? currentStreak : 0;
}

/** Whole days between the student's last log-day and today's log-day. */
export function daysSinceLastLog(lastLogDate: string | null | undefined, now: Date = new Date()): number | null {
  if (!lastLogDate) return null;
  const today = getLogDateString(now);
  return Math.max(0, Math.round((Date.parse(today) - Date.parse(lastLogDate)) / MS_PER_DAY));
}

// ── Momentum Shield display math (founder spec, 20 July) ─────────────────────
// Streaks never hard-reset. Missed days consume shields first (streak
// untouched); with shields gone, each missed day decays the streak by 1.
// 21 consecutive logged days earn +1 shield (max 3) — that part lives in the
// upsert_log_and_streak replay in Postgres. THIS function mirrors the same
// shield/decay math over the days since the last log, so what a student sees
// mid-miss is exactly what the RPC will persist at their next log (+1 for
// that log). Today never counts as a miss — it's still loggable.
export interface MomentumState {
  streak: number;        // the live streak shown now — 0 if broken & not restored
  shields: number;       // restore tokens the student holds (0–3)
  missedDays: number;    // full days missed since last log (excluding today)
  shieldsUsed: number;   // legacy (auto-shield era) — always 0 now
  decayed: number;       // legacy — always 0 now
  broken: boolean;       // missed ≥1 full day and hasn't restored → streak paused
  canRestore: boolean;   // broken AND holds a shield to spend
  restorable: number;    // the streak value they'd get back by restoring
}

// Manual-restore model (founder, 23 Jul): shields NO LONGER auto-cover misses.
// Miss a day → the streak visibly breaks; the student taps "Restore" to spend a
// shield and bring it back themselves (Snapchat-style). Today is still loggable,
// so a same-day view is never "broken".
export function momentumStreak(
  currentStreak: number | null | undefined,
  shields: number | null | undefined,
  lastLogDate: string | null | undefined,
  now: Date = new Date()
): MomentumState {
  const s = Math.max(0, currentStreak ?? 0);
  const h = shields ?? 3;
  const since = daysSinceLastLog(lastLogDate, now);
  // No streak yet, or logged today/yesterday → active, nothing to restore.
  if (s <= 0 || since == null || since <= 1) {
    return { streak: s, shields: h, missedDays: 0, shieldsUsed: 0, decayed: 0, broken: false, canRestore: false, restorable: s };
  }
  // Missed at least one full day and hasn't restored → broken.
  return { streak: 0, shields: h, missedDays: since - 1, shieldsUsed: 0, decayed: 0, broken: true, canRestore: h >= 1, restorable: s };
}

