/**
 * Mock Drop Detection & Alert Utilities
 * Detects score drops >8 percentile points and triggers interventions
 */

import { createClient } from '@/lib/supabase/client';

export interface MockTestResult {
  id: string;
  student_id: string;
  test_type: string;
  score: number;
  percentile: number;
  created_at: string;
  category_breakdown?: {
    quant?: { score: number; accuracy: number };
    varc?: { score: number; accuracy: number };
    lrdi?: { score: number; accuracy: number };
  };
}

export interface DropAlert {
  previousPercentile: number;
  currentPercentile: number;
  drop: number;
  isSignificant: boolean;
  previousDate: string;
  currentDate: string;
}

const DROP_THRESHOLD = 8; // percentile points

/**
 * Detect if current test has significant drop from previous best
 */
export async function detectMockDrop(
  studentId: string
): Promise<DropAlert | null> {
  const supabase = createClient();

  try {
    // Get last 10 mock tests
    const { data: tests, error } = await supabase
      .from('test_results')
      .select('*')
      .eq('student_id', studentId)
      .eq('test_type', 'mock')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error || !tests || tests.length < 2) {
      return null; // Not enough tests to compare
    }

    const currentTest = tests[0] as MockTestResult;
    const previousBest = tests.slice(1).reduce((best, test) => {
      const t = test as MockTestResult;
      return t.percentile > best.percentile ? t : best;
    });

    const drop = previousBest.percentile - currentTest.percentile;

    if (drop >= DROP_THRESHOLD) {
      return {
        previousPercentile: previousBest.percentile,
        currentPercentile: currentTest.percentile,
        drop,
        isSignificant: drop >= DROP_THRESHOLD,
        previousDate: previousBest.created_at,
        currentDate: currentTest.created_at
      };
    }

    return null;
  } catch (error) {
    console.error('Error detecting mock drop:', error);
    return null;
  }
}

/**
 * Create alert for buddy when drop is detected
 */
export async function createDropAlert(
  studentId: string,
  buddyId: string,
  dropAlert: DropAlert,
  testScore: number
) {
  const supabase = createClient();

  try {
    // Get student name for message
    const { data: student } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', studentId)
      .single();

    if (!student) return;

    const studentName = student.full_name.split(' ')[0];
    const message = `Alert: ${studentName}'s mock score dropped ${dropAlert.drop.toFixed(1)} percentile (from ${dropAlert.previousPercentile.toFixed(1)} to ${dropAlert.currentPercentile.toFixed(1)}). Score: ${testScore}/100. Needs guidance.`;

    // Insert into mock_drop_alerts table
    const { error: alertError } = await supabase
      .from('mock_drop_alerts')
      .insert({
        student_id: studentId,
        previous_percentile: dropAlert.previousPercentile,
        current_percentile: dropAlert.currentPercentile,
        drop_points: dropAlert.drop,
        test_score: testScore,
        triggered_at: new Date().toISOString(),
        buddy_notified: false
      });

    if (alertError) throw alertError;

    // Also create a feedback message for the buddy
    const { error: feedbackError } = await supabase
      .from('feedback')
      .insert({
        student_id: studentId,
        buddy_id: buddyId,
        feedback_text: message,
        feedback_type: 'drop_alert',
        rating: null
      });

    if (feedbackError) throw feedbackError;

    // Mark alert as notified
    await supabase
      .from('mock_drop_alerts')
      .update({ buddy_notified: true })
      .eq('student_id', studentId)
      .order('triggered_at', { ascending: false })
      .limit(1);

    return true;
  } catch (error) {
    console.error('Error creating drop alert:', error);
    return false;
  }
}

/**
 * Get contextual message based on drop magnitude
 */
export function getDropMessage(drop: number): string {
  if (drop >= 20) {
    return 'significant drop';
  } else if (drop >= 15) {
    return 'considerable drop';
  } else if (drop >= 10) {
    return 'notable drop';
  }
  return 'drop';
}

/**
 * Get emoji indicator based on drop
 */
export function getDropEmoji(drop: number): string {
  if (drop >= 20) return '🚨';
  if (drop >= 15) return '⚠️';
  if (drop >= 10) return '📉';
  return '⏬';
}
