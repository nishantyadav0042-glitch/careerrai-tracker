/**
 * Streak Calculation Utilities
 * Handles streak tracking, milestone detection, and streak guard logic
 */

import { createClient } from '@/lib/supabase/client';

export interface StreakData {
  current_streak: number;
  longest_streak: number;
  last_log_date: string | null;
  milestone_sent_7: boolean;
  milestone_sent_21: boolean;
}

/**
 * Calculate if streak is active based on last log date
 * Streak is active if last log was today or yesterday
 * Breaks if last log was >24 hours ago
 */
export function isStreakActive(lastLogDate: string | null): boolean {
  if (!lastLogDate) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const lastDate = new Date(lastLogDate);
  lastDate.setHours(0, 0, 0, 0);

  return lastDate.getTime() === today.getTime() || lastDate.getTime() === yesterday.getTime();
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
