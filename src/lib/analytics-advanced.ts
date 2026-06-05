/**
 * Advanced Analytics for Student Performance
 * Provides trend analysis, correlations, and predictive insights
 */

import { createClient } from '@/lib/supabase/client';

export interface PerformanceTrend {
  dates: string[];
  scores: number[];
  percentiles: number[];
  trend: 'improving' | 'declining' | 'stable';
  trendPoints: number; // positive = improving, negative = declining
}

export interface ConfidenceStressCorrelation {
  avgConfidence: number;
  avgStress: number;
  correlation: number; // -1 to 1, negative = inverse relationship
  insight: string;
}

export interface StudyIntensityPattern {
  avgHoursPerDay: number;
  consistencyScore: number; // 0-100
  peakDay: string; // day of week
  trend: 'increasing' | 'decreasing' | 'stable';
}

export interface CATReadiness {
  currentPercentile: number;
  targetPercentile: number;
  daysToExam: number;
  recommendedDailyImprovement: number; // percentile points
  readinessLevel: 'not_ready' | 'on_track' | 'ahead';
  expectedFinalPercentile: number;
}

/**
 * Analyze mock score trends over time
 */
export async function analyzeMockTrend(studentId: string): Promise<PerformanceTrend> {
  const supabase = createClient();

  try {
    const { data: tests } = await supabase
      .from('test_results')
      .select('*')
      .eq('student_id', studentId)
      .eq('test_type', 'mock')
      .order('created_at', { ascending: true })
      .limit(20);

    if (!tests || tests.length === 0) {
      return {
        dates: [],
        scores: [],
        percentiles: [],
        trend: 'stable',
        trendPoints: 0
      };
    }

    const dates = tests.map((t) => new Date(t.created_at).toLocaleDateString());
    const scores = tests.map((t) => t.score);
    const percentiles = tests.map((t) => t.percentile);

    // Calculate trend using linear regression
    const trendPoints = calculateTrend(percentiles);
    const trend: 'improving' | 'declining' | 'stable' =
      trendPoints > 2 ? 'improving' : trendPoints < -2 ? 'declining' : 'stable';

    return {
      dates,
      scores,
      percentiles,
      trend,
      trendPoints
    };
  } catch (error) {
    console.error('Error analyzing mock trend:', error);
    return {
      dates: [],
      scores: [],
      percentiles: [],
      trend: 'stable',
      trendPoints: 0
    };
  }
}

/**
 * Analyze confidence-stress correlation
 */
export async function analyzeConfidenceStressCorrelation(
  studentId: string
): Promise<ConfidenceStressCorrelation> {
  const supabase = createClient();

  try {
    const { data: logs } = await supabase
      .from('daily_reports')
      .select('confidence_level, stress_level')
      .eq('student_id', studentId)
      .order('report_date', { ascending: false })
      .limit(30);

    if (!logs || logs.length < 3) {
      return {
        avgConfidence: 0,
        avgStress: 0,
        correlation: 0,
        insight: 'Not enough data'
      };
    }

    const confidenceValues = logs.map((l) => l.confidence_level || 0);
    const stressValues = logs.map((l) => l.stress_level || 0);

    const avgConfidence = confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length;
    const avgStress = stressValues.reduce((a, b) => a + b, 0) / stressValues.length;
    const correlation = calculatePearsonCorrelation(confidenceValues, stressValues);

    let insight = '';
    if (correlation < -0.5) {
      insight = 'Higher confidence associated with lower stress - strong positive mindset';
    } else if (correlation > 0.5) {
      insight = 'Confidence and stress tracking together - may need mental clarity work';
    } else {
      insight = 'Confidence and stress levels are independent - stay balanced';
    }

    return {
      avgConfidence,
      avgStress,
      correlation,
      insight
    };
  } catch (error) {
    console.error('Error analyzing correlation:', error);
    return {
      avgConfidence: 0,
      avgStress: 0,
      correlation: 0,
      insight: 'Unable to analyze'
    };
  }
}

/**
 * Analyze study intensity patterns
 */
export async function analyzeStudyIntensity(studentId: string): Promise<StudyIntensityPattern> {
  const supabase = createClient();

  try {
    const { data: logs } = await supabase
      .from('daily_reports')
      .select('study_duration, report_date')
      .eq('student_id', studentId)
      .order('report_date', { ascending: false })
      .limit(30);

    if (!logs || logs.length === 0) {
      return {
        avgHoursPerDay: 0,
        consistencyScore: 0,
        peakDay: 'unknown',
        trend: 'stable'
      };
    }

    // Calculate metrics
    const hours = logs.map((l) => l.study_duration || 0);
    const avgHoursPerDay = hours.reduce((a, b) => a + b, 0) / hours.length;
    const consistencyScore = calculateConsistency(hours);
    const trend = calculateTrend(hours) > 0 ? 'increasing' : calculateTrend(hours) < 0 ? 'decreasing' : 'stable';

    // Find peak day
    const dayMap: Record<string, number[]> = {};
    logs.forEach((log) => {
      const day = new Date(log.report_date).toLocaleDateString('en-US', { weekday: 'long' });
      if (!dayMap[day]) dayMap[day] = [];
      dayMap[day].push(log.study_duration || 0);
    });

    let peakDay = 'unknown';
    let maxAvg = 0;
    Object.entries(dayMap).forEach(([day, values]) => {
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      if (avg > maxAvg) {
        maxAvg = avg;
        peakDay = day;
      }
    });

    return {
      avgHoursPerDay,
      consistencyScore,
      peakDay,
      trend
    };
  } catch (error) {
    console.error('Error analyzing study intensity:', error);
    return {
      avgHoursPerDay: 0,
      consistencyScore: 0,
      peakDay: 'unknown',
      trend: 'stable'
    };
  }
}

/**
 * Assess CAT readiness
 */
export async function assessCATReadiness(studentId: string): Promise<CATReadiness> {
  const supabase = createClient();

  try {
    // Get student profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('cat_percentile')
      .eq('id', studentId)
      .single();

    const currentPercentile = profile?.cat_percentile || 0;
    const targetPercentile = 90; // Target for competitive college
    const examDate = new Date(2026, 10, 23); // Nov 23, 2026
    const today = new Date();
    const daysToExam = Math.ceil((examDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    // Get recent test trend
    const { data: tests } = await supabase
      .from('test_results')
      .select('percentile')
      .eq('student_id', studentId)
      .eq('test_type', 'mock')
      .order('created_at', { ascending: false })
      .limit(10);

    const percentiles = tests?.map((t) => t.percentile) || [];
    const trendSlope = calculateTrend(percentiles);

    // Calculate expected improvement
    const improvementNeeded = targetPercentile - currentPercentile;
    const recommendedDailyImprovement =
      daysToExam > 0 ? improvementNeeded / daysToExam : 0;

    // Estimate final percentile based on trend
    const estimatedImprovement = trendSlope * (daysToExam / 30);
    const expectedFinalPercentile = currentPercentile + estimatedImprovement;

    // Determine readiness
    let readinessLevel: 'not_ready' | 'on_track' | 'ahead';
    if (expectedFinalPercentile < 70) {
      readinessLevel = 'not_ready';
    } else if (expectedFinalPercentile < 85) {
      readinessLevel = 'on_track';
    } else {
      readinessLevel = 'ahead';
    }

    return {
      currentPercentile,
      targetPercentile,
      daysToExam,
      recommendedDailyImprovement,
      readinessLevel,
      expectedFinalPercentile: Math.min(99, Math.max(0, expectedFinalPercentile))
    };
  } catch (error) {
    console.error('Error assessing CAT readiness:', error);
    return {
      currentPercentile: 0,
      targetPercentile: 90,
      daysToExam: 0,
      recommendedDailyImprovement: 0,
      readinessLevel: 'not_ready',
      expectedFinalPercentile: 0
    };
  }
}

/**
 * Helper: Calculate trend using simple linear regression
 */
function calculateTrend(values: number[]): number {
  if (values.length < 2) return 0;

  const n = values.length;
  const x = Array.from({ length: n }, (_, i) => i);
  const xMean = x.reduce((a, b) => a + b, 0) / n;
  const yMean = values.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < n; i++) {
    numerator += (x[i] - xMean) * (values[i] - yMean);
    denominator += (x[i] - xMean) ** 2;
  }

  return denominator !== 0 ? numerator / denominator : 0;
}

/**
 * Helper: Calculate Pearson correlation
 */
function calculatePearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  const xMean = x.reduce((a, b) => a + b, 0) / n;
  const yMean = y.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denomX = 0;
  let denomY = 0;

  for (let i = 0; i < n; i++) {
    const xDiff = x[i] - xMean;
    const yDiff = y[i] - yMean;
    numerator += xDiff * yDiff;
    denomX += xDiff ** 2;
    denomY += yDiff ** 2;
  }

  const denominator = Math.sqrt(denomX * denomY);
  return denominator !== 0 ? numerator / denominator : 0;
}

/**
 * Helper: Calculate consistency score (0-100)
 */
function calculateConsistency(values: number[]): number {
  if (values.length === 0) return 0;

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + (val - mean) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);
  const cv = mean !== 0 ? stdDev / mean : 0;

  // Convert CV to consistency score (lower CV = higher consistency)
  return Math.max(0, Math.min(100, 100 - cv * 50));
}
