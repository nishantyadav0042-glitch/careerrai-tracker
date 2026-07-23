/**
 * Streak Calculation Utilities
 * Handles streak tracking, milestone detection, and streak guard logic
 */

import { createClient } from '@/lib/supabase/client';

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
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
export function getLogDateString(now: Date = new Date()): string {
  const istMs = now.getTime() + IST_OFFSET_MS;
  const istHour = new Date(istMs).getUTCHours();
  const adjustedMs = istHour < 3 ? istMs - 86_400_000 : istMs;
  return new Date(adjustedMs).toISOString().split('T')[0];
}

// ── Shared constants (import from here — never hardcode elsewhere) ───────────
export const MS_PER_DAY = 86_400_000;
export const CAT_EXAM_DATE = new Date(2026, 10, 29); // Nov 29 2026

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

/**
 * Get number of days in current streak
 * Returns 0 if streak is broken
 */
export function getStreakDays(streakData: StreakData | null): number {
  if (!streakData) return 0;

  const isActive = isStreakActive(streakData.last_log_date);
  return isActive ? streakData.current_streak : 0;
}

/**
 * Calculate streak status for display
 */
export function getStreakStatus(streakData: StreakData | null) {
  if (!streakData) {
    return {
      days: 0,
      status: 'none' as const,
      isActive: false,
      isBroken: false,
      message: 'Start your streak today'
    };
  }

  const isActive = isStreakActive(streakData.last_log_date);

  return {
    days: streakData.current_streak,
    status: isActive ? 'active' : 'broken' as const,
    isActive,
    isBroken: !isActive && streakData.current_streak > 0,
    message: isActive
      ? `Day streak 🔥 Keep it alive`
      : 'Streak lost. Your buddy has been notified.'
  };
}

/**
 * Get flame animation state based on streak days
 */
export function getFlameState(days: number) {
  if (days === 0) return 'none';
  if (days < 7) return 'basic'; // Orange, no glow
  if (days < 14) return 'glowing'; // Orange with drop-shadow glow
  return 'gold'; // Gold gradient with pulse animation
}

/**
 * Update streak after daily report submission
 * Called when student submits a daily report
 */
export async function updateStreakAfterLog(studentId: string) {
  const supabase = createClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayString = today.toISOString().split('T')[0];

  try {
    // Get or create streak_data
    const { data: existing, error: fetchError } = await supabase
      .from('streak_data')
      .select('*')
      .eq('student_id', studentId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      throw fetchError;
    }

    if (existing) {
      // Update existing streak
      const lastDate = existing.last_log_date ? new Date(existing.last_log_date) : null;
      lastDate?.setHours(0, 0, 0, 0);

      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      let newStreak = existing.current_streak;

      // If logged today already, don't increment
      if (lastDate?.getTime() !== today.getTime()) {
        // If logged yesterday, increment streak
        if (lastDate?.getTime() === yesterday.getTime()) {
          newStreak += 1;
        } else {
          // Streak broken, reset to 1
          newStreak = 1;
        }
      }

      const newLongest = Math.max(existing.longest_streak, newStreak);

      const { error: updateError } = await supabase
        .from('streak_data')
        .update({
          current_streak: newStreak,
          longest_streak: newLongest,
          last_log_date: todayString,
          updated_at: new Date().toISOString()
        })
        .eq('student_id', studentId);

      if (updateError) throw updateError;

      return {
        currentStreak: newStreak,
        longestStreak: newLongest,
        lastLogDate: todayString
      };
    } else {
      // Create new streak_data
      const { error: createError } = await supabase
        .from('streak_data')
        .insert({
          student_id: studentId,
          current_streak: 1,
          longest_streak: 1,
          last_log_date: todayString
        });

      if (createError) throw createError;

      return {
        currentStreak: 1,
        longestStreak: 1,
        lastLogDate: todayString
      };
    }
  } catch (error) {
    console.error('Error updating streak:', error);
    throw error;
  }
}

/**
 * Check and create milestone messages for Day 7 and Day 21 streaks
 * Called after streak update
 */
export async function checkAndCreateMilestones(studentId: string, buddyId: string) {
  const supabase = createClient();
  try {
    const { data: streakData, error: fetchError } = await supabase
      .from('streak_data')
      .select('*')
      .eq('student_id', studentId)
      .single();

    if (fetchError) throw fetchError;
    if (!streakData) return;

    const { data: student } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', studentId)
      .single();

    const { data: buddy } = await supabase
      .from('profiles')
      .select('full_name, college')
      .eq('id', buddyId)
      .single();

    if (!student || !buddy) return;

    const studentName = student.full_name.split(' ')[0];
    const buddyName = buddy.full_name.split(' ')[0];
    const collegeLabel = buddy.college ? `, ${buddy.college}` : '';

    // Day 7 milestone
    if (streakData.current_streak === 7 && !streakData.milestone_sent_7) {
      const message = `${studentName}, 7 days in a row. Most students don't make it here. You're already ahead of 60% of this batch. Keep it up. — ${buddyName}${collegeLabel}`;

      const { error: insertError } = await supabase
        .from('feedback')
        .insert({
          student_id: studentId,
          buddy_id: buddyId,
          feedback_text: message,
          feedback_type: 'milestone_auto',
          rating: null
        });

      if (!insertError) {
        // Mark milestone as sent
        await supabase
          .from('streak_data')
          .update({ milestone_sent_7: true })
          .eq('student_id', studentId);

        // Notify buddy
        console.log(`[MILESTONE] Day 7 milestone created for ${studentName} by ${buddyName}`);
      }
    }

    // Day 21 milestone
    if (streakData.current_streak === 21 && !streakData.milestone_sent_21) {
      const message = `${studentName}, 3 weeks of consistency. This is where serious aspirants separate from the rest. Your CAT prep is on track. — ${buddyName}${collegeLabel}`;

      const { error: insertError } = await supabase
        .from('feedback')
        .insert({
          student_id: studentId,
          buddy_id: buddyId,
          feedback_text: message,
          feedback_type: 'milestone_auto',
          rating: null
        });

      if (!insertError) {
        // Mark milestone as sent
        await supabase
          .from('streak_data')
          .update({ milestone_sent_21: true })
          .eq('student_id', studentId);

        // Notify buddy
        console.log(`[MILESTONE] Day 21 milestone created for ${studentName} by ${buddyName}`);
      }
    }
  } catch (error) {
    console.error('Error checking milestones:', error);
    // Don't throw - milestone failure shouldn't break the log
  }
}

/**
 * Check if streak guard banner should show (after 9 PM, not logged today)
 */
export function shouldShowStreakGuard(streakData: StreakData | null): boolean {
  // Get current time
  const now = new Date();
  const hours = now.getHours();

  // Only show after 9 PM (21:00)
  if (hours < 21) return false;

  // Check if logged today
  if (!streakData) return true; // New user, show guard

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!streakData.last_log_date) return true;

  const lastDate = new Date(streakData.last_log_date);
  lastDate.setHours(0, 0, 0, 0);

  // Show if not logged today
  return lastDate.getTime() !== today.getTime();
}
