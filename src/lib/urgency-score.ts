/**
 * Urgency Score Algorithm for Buddy Triage
 * Calculates which students need buddy attention (0-100 scale)
 * Factors: streak status, mock drops, days since feedback, performance trend
 */

import { createClient } from '@/lib/supabase/client';

export interface StudentUrgencyData {
  student_id: string;
  student_name: string;
  cat_percentile: number | null;
  score: number; // 0-100
  severity: 'critical' | 'warning' | 'normal';
  reasons: string[];
  lastFeedback: string | null;
  daysSinceFeedback: number;
  streakStatus: 'active' | 'broken';
  streakDays: number;
  recentDrops: number;
}

export interface UrgencyFactors {
  streakBroken: boolean;
  mockDropDetected: boolean;
  noFeedbackDays: number;
  performanceDropping: boolean;
  lowPercentile: boolean;
}

/**
 * Calculate urgency score (0-100)
 * Higher = more urgent
 */
export function calculateUrgencyScore(factors: UrgencyFactors): number {
  let score = 0;

  // Streak broken (Critical - 40 points)
  if (factors.streakBroken) {
    score += 40;
  }

  // Mock drop detected (High - 35 points)
  if (factors.mockDropDetected) {
    score += 35;
  }

  // No feedback sent recently (Days without feedback)
  // 1-3 days: 5 points
  // 4-7 days: 15 points
  // 8-14 days: 25 points
  // 14+ days: 35 points
  if (factors.noFeedbackDays > 14) {
    score += 35;
  } else if (factors.noFeedbackDays > 8) {
    score += 25;
  } else if (factors.noFeedbackDays > 4) {
    score += 15;
  } else if (factors.noFeedbackDays > 1) {
    score += 5;
  }

  // Performance dropping trend (15 points)
  if (factors.performanceDropping) {
    score += 15;
  }

  // Low percentile (<30) (10 points)
  if (factors.lowPercentile) {
    score += 10;
  }

  return Math.min(100, score); // Cap at 100
}

/**
 * Get severity level based on score
 */
export function getSeverity(score: number): 'critical' | 'warning' | 'normal' {
  if (score >= 60) return 'critical';
  if (score >= 35) return 'warning';
  return 'normal';
}

/**
 * Get color for severity
 */
export function getSeverityColor(
  severity: 'critical' | 'warning' | 'normal'
): string {
  const colors = {
    critical: 'from-red-600 to-red-700',
    warning: 'from-amber-600 to-amber-700',
    normal: 'from-emerald-600 to-emerald-700'
  };
  return colors[severity];
}

/**
 * Get emoji for severity
 */
export function getSeverityEmoji(
  severity: 'critical' | 'warning' | 'normal'
): string {
  const emojis = {
    critical: '🚨',
    warning: '⚠️',
    normal: '✅'
  };
  return emojis[severity];
}

/**
 * Build list of reasons for high urgency
 */
export function buildUrgencyReasons(factors: UrgencyFactors): string[] {
  const reasons: string[] = [];

  if (factors.streakBroken) {
    reasons.push('Streak broken - needs motivation');
  }
  if (factors.mockDropDetected) {
    reasons.push('Recent mock score drop detected');
  }
  if (factors.noFeedbackDays > 7) {
    reasons.push(`No feedback for ${factors.noFeedbackDays} days`);
  }
  if (factors.performanceDropping) {
    reasons.push('Performance showing downward trend');
  }
  if (factors.lowPercentile) {
    reasons.push('Low percentile score - needs strategy review');
  }

  return reasons.length > 0 ? reasons : ['Routine check-in recommended'];
}

/**
 * Load full student urgency data
 */
export async function loadStudentUrgency(
  studentId: string
): Promise<StudentUrgencyData | null> {
  const supabase = createClient();

  try {
    // Get student profile
    const { data: student } = await supabase
      .from('profiles')
      .select('full_name, cat_percentile')
      .eq('id', studentId)
      .single();

    if (!student) return null;

    // Get streak data
    const { data: streak } = await supabase
      .from('streak_data')
      .select('current_streak, last_log_date')
      .eq('student_id', studentId)
      .single();

    // Get latest test
    const { data: latestTest } = await supabase
      .from('test_results')
      .select('percentile, created_at')
      .eq('student_id', studentId)
      .eq('test_type', 'mock')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Get drop alerts (last 7 days)
    const { data: dropAlerts } = await supabase
      .from('mock_drop_alerts')
      .select('*')
      .eq('student_id', studentId)
      .gte('triggered_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    // Get latest feedback
    const { data: latestFeedback } = await supabase
      .from('feedback')
      .select('created_at')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Calculate factors
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastLogDate = streak?.last_log_date
      ? new Date(streak.last_log_date)
      : null;
    lastLogDate?.setHours(0, 0, 0, 0);

    const streakBroken =
      !lastLogDate ||
      (today.getTime() - lastLogDate.getTime()) / (1000 * 60 * 60 * 24) > 1;

    const daysSinceFeedback = latestFeedback
      ? Math.floor(
          (today.getTime() - new Date(latestFeedback.created_at).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : 999;

    const factors: UrgencyFactors = {
      streakBroken,
      mockDropDetected: (dropAlerts?.length || 0) > 0,
      noFeedbackDays: daysSinceFeedback,
      performanceDropping: false, // TODO: Implement trend analysis
      lowPercentile: (student.cat_percentile || 0) < 30
    };

    const score = calculateUrgencyScore(factors);
    const severity = getSeverity(score);
    const reasons = buildUrgencyReasons(factors);

    return {
      student_id: studentId,
      student_name: student.full_name,
      cat_percentile: student.cat_percentile,
      score,
      severity,
      reasons,
      lastFeedback: latestFeedback?.created_at || null,
      daysSinceFeedback,
      streakStatus: streakBroken ? 'broken' : 'active',
      streakDays: streak?.current_streak || 0,
      recentDrops: dropAlerts?.length || 0
    };
  } catch (error) {
    console.error('Error loading student urgency:', error);
    return null;
  }
}

/**
 * Get all assigned students with urgency scores, sorted by urgency
 */
export async function loadBuddyStudents(
  buddyId: string
): Promise<StudentUrgencyData[]> {
  const supabase = createClient();

  try {
    // Get all students assigned to this buddy
    const { data: students } = await supabase
      .from('profiles')
      .select('id, full_name, cat_percentile')
      .eq('buddy_id', buddyId)
      .order('full_name');

    if (!students || students.length === 0) {
      return [];
    }

    // Load urgency data for each student
    const urgencyData: StudentUrgencyData[] = [];

    for (const student of students) {
      const data = await loadStudentUrgency(student.id);
      if (data) {
        urgencyData.push(data);
      }
    }

    // Sort by urgency score (descending)
    return urgencyData.sort((a, b) => b.score - a.score);
  } catch (error) {
    console.error('Error loading buddy students:', error);
    return [];
  }
}
