/**
 * Urgency Score Algorithm for Buddy Triage
 * Calculates which students need buddy attention (0-100 scale)
 * Factors: streak status, mock drops, days since feedback, performance trend
 */

import { createClient } from '@/lib/supabase/client';
import { liveStreak } from '@/lib/streak-utils';

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
  free_onboarding_used?: boolean;
  // Efficacy metrics — the north-star truth layer
  starting_percentile: number | null;
  percentileDelta: number | null;      // cat_percentile − starting_percentile
  daysSinceLastMock: number | null;    // days since latest mock_debrief.taken_on
  daysSinceLastDebrief: number | null; // same (debrief = mock_debrief row exists)
  isFlat: boolean;                     // 14+ days logged, no upward percentile movement
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
    // These five reads are independent — fetch them concurrently instead of
    // one-after-another (was 5 sequential round-trips per student).
    const [
      { data: student },
      { data: streak },
      { data: latestTest },
      { data: dropAlerts },
      { data: latestFeedback },
    ] = await Promise.all([
      supabase
        .from('profiles')
        .select('full_name, cat_percentile')
        .eq('id', studentId)
        .single(),
      supabase
        .from('streak_data')
        .select('current_streak, last_log_date')
        .eq('student_id', studentId)
        .single(),
      supabase
        .from('test_results')
        .select('percentile, created_at')
        .eq('student_id', studentId)
        .eq('test_type', 'mock')
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
      supabase
        .from('mock_drop_alerts')
        .select('*')
        .eq('student_id', studentId)
        .gte('triggered_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
      supabase
        .from('feedback')
        .select('created_at')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
    ]);

    if (!student) return null;

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
      performanceDropping: false, // trend analysis not computed yet — mock-drop alerts cover the acute case above
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
      // streakStatus already knows this streak is broken; streakDays used to
      // print the stale number beside it, so a card could read "broken · 7 days".
      streakDays: liveStreak(streak?.current_streak, streak?.last_log_date),
      recentDrops: dropAlerts?.length || 0,
      // Efficacy fields — null here; populated by loadBuddyStudents which has the batch data
      starting_percentile: null,
      percentileDelta: null,
      daysSinceLastMock: null,
      daysSinceLastDebrief: null,
      isFlat: false,
    };
  } catch (error) {
    console.error('Error loading student urgency:', error);
    return null;
  }
}

/**
 * Get all assigned students with urgency + efficacy scores, sorted by urgency.
 * Uses 6 batched .in() queries regardless of student count — eliminates the N×5 pattern.
 */
export async function loadBuddyStudents(
  buddyId: string
): Promise<StudentUrgencyData[]> {
  const supabase = createClient();

  try {
    const { data: students } = await supabase
      .from('profiles')
      .select('id, full_name, cat_percentile, starting_percentile, free_onboarding_used')
      .eq('buddy_id', buddyId)
      .order('full_name');

    if (!students || students.length === 0) return [];

    const ids = students.map((s) => s.id);
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000).toISOString().split('T')[0];

    // 6 batched queries — constant cost regardless of student count.
    const [
      { data: streaks },
      { data: dropAlerts },
      { data: feedbacks },
      { data: latestDebriefs },
      { data: logCounts },
    ] = await Promise.all([
      supabase
        .from('streak_data')
        .select('student_id, current_streak, last_log_date')
        .in('student_id', ids),
      supabase
        .from('mock_drop_alerts')
        .select('student_id')
        .in('student_id', ids)
        .gte('triggered_at', sevenDaysAgo),
      supabase
        .from('feedback')
        .select('student_id, created_at')
        .in('student_id', ids)
        .order('created_at', { ascending: false }),
      supabase
        .from('mock_debriefs')
        .select('student_id, taken_on, overall_percentile')
        .in('student_id', ids)
        .order('taken_on', { ascending: false }),
      supabase
        .from('daily_reports')
        .select('student_id, report_date')
        .in('student_id', ids)
        .gte('report_date', fourteenDaysAgo),
    ]);

    // Build lookup maps (all in-memory — no extra queries)
    const streakMap: Record<string, { current_streak: number; last_log_date: string | null }> = {};
    for (const s of streaks ?? []) streakMap[s.student_id] = s;

    const dropAlertCountMap: Record<string, number> = {};
    for (const a of dropAlerts ?? []) {
      dropAlertCountMap[a.student_id] = (dropAlertCountMap[a.student_id] ?? 0) + 1;
    }

    // Latest feedback per student (results ordered desc — first hit wins)
    const latestFeedbackMap: Record<string, { created_at: string }> = {};
    for (const f of feedbacks ?? []) {
      if (!latestFeedbackMap[f.student_id]) latestFeedbackMap[f.student_id] = f;
    }

    // Latest debrief + full percentile history per student
    const latestDebriefMap: Record<string, { taken_on: string; overall_percentile: number | null }> = {};
    const debriefPercentilesByStudent: Record<string, number[]> = {};
    for (const d of latestDebriefs ?? []) {
      if (!latestDebriefMap[d.student_id]) latestDebriefMap[d.student_id] = d;
      if (d.overall_percentile !== null) {
        (debriefPercentilesByStudent[d.student_id] ??= []).push(d.overall_percentile);
      }
    }

    const logCountByStudent: Record<string, number> = {};
    for (const r of logCounts ?? []) {
      logCountByStudent[r.student_id] = (logCountByStudent[r.student_id] ?? 0) + 1;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const urgencyData: StudentUrgencyData[] = students.map((student) => {
      const streak = streakMap[student.id];
      const latestFeedback = latestFeedbackMap[student.id];
      const dropAlertCount = dropAlertCountMap[student.id] ?? 0;
      const latestDebrief = latestDebriefMap[student.id];

      const lastLogDate = streak?.last_log_date ? new Date(streak.last_log_date) : null;
      lastLogDate?.setHours(0, 0, 0, 0);
      const streakBroken =
        !lastLogDate ||
        (today.getTime() - lastLogDate.getTime()) / (1000 * 60 * 60 * 24) > 1;

      const daysSinceFeedback = latestFeedback
        ? Math.floor(
            (today.getTime() - new Date(latestFeedback.created_at).getTime()) / (1000 * 60 * 60 * 24)
          )
        : 999;

      const factors: UrgencyFactors = {
        streakBroken,
        mockDropDetected: dropAlertCount > 0,
        noFeedbackDays: daysSinceFeedback,
        performanceDropping: false,
        lowPercentile: (student.cat_percentile ?? 0) < 30,
      };

      const score = calculateUrgencyScore(factors);
      const severity = getSeverity(score);
      const reasons = buildUrgencyReasons(factors);

      const daysSinceLastMock = latestDebrief
        ? Math.round(
            (today.getTime() - new Date(latestDebrief.taken_on + 'T00:00:00').getTime()) / 86_400_000
          )
        : null;

      const percentileDelta =
        student.cat_percentile !== null && student.starting_percentile !== null
          ? Math.round((student.cat_percentile - student.starting_percentile) * 10) / 10
          : null;

      const logsLast14 = logCountByStudent[student.id] ?? 0;
      const pcts = debriefPercentilesByStudent[student.id] ?? [];
      const isFlat =
        logsLast14 >= 14 &&
        (pcts.length === 0 || (pcts.length >= 2 && pcts[0] - pcts[pcts.length - 1] < 2));

      return {
        student_id: student.id,
        student_name: student.full_name,
        cat_percentile: student.cat_percentile,
        score,
        severity,
        reasons,
        lastFeedback: latestFeedback?.created_at ?? null,
        daysSinceFeedback,
        streakStatus: streakBroken ? 'broken' : 'active',
        streakDays: liveStreak(streak?.current_streak, streak?.last_log_date),
        recentDrops: dropAlertCount,
        free_onboarding_used: student.free_onboarding_used ?? false,
        starting_percentile: student.starting_percentile ?? null,
        percentileDelta,
        daysSinceLastMock,
        daysSinceLastDebrief: daysSinceLastMock,
        isFlat,
      };
    });

    return urgencyData.sort((a, b) => b.score - a.score);
  } catch (error) {
    console.error('Error loading buddy students:', error);
    return [];
  }
}
