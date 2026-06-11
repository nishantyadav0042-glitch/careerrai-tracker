'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import {
  analyzeMockTrend,
  analyzeConfidenceStressCorrelation,
  analyzeStudyIntensity,
  assessCATReadiness,
  PerformanceTrend,
  ConfidenceStressCorrelation,
  StudyIntensityPattern,
  CATReadiness
} from '@/lib/analytics-advanced';
import { TrendingUp, TrendingDown, AlertCircle, Target } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AnalyticsDashboardProps {
  studentId: string;
}

export function AnalyticsDashboard({ studentId }: AnalyticsDashboardProps) {
  const [mockTrend, setMockTrend] = useState<PerformanceTrend | null>(null);
  const [correlation, setCorrelation] = useState<ConfidenceStressCorrelation | null>(null);
  const [intensity, setIntensity] = useState<StudyIntensityPattern | null>(null);
  const [readiness, setReadiness] = useState<CATReadiness | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadAnalytics = useCallback(async () => {
    setIsLoading(true);
    try {
      const [trend, corr, intens, read] = await Promise.all([
        analyzeMockTrend(studentId),
        analyzeConfidenceStressCorrelation(studentId),
        analyzeStudyIntensity(studentId),
        assessCATReadiness(studentId)
      ]);

      setMockTrend(trend);
      setCorrelation(corr);
      setIntensity(intens);
      setReadiness(read);
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setIsLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <div className="w-10 h-10 border-3 border-orange-200 border-t-orange-600 rounded-full animate-spin mx-auto mb-3" />
        <p className="text-stone-600">Analyzing performance...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* CAT Readiness */}
      {readiness && (
        <Card className={cn(
          'p-6 border-l-4',
          readiness.readinessLevel === 'ahead'
            ? 'border-emerald-600 bg-emerald-50'
            : readiness.readinessLevel === 'on_track'
            ? 'border-blue-600 bg-blue-50'
            : 'border-red-600 bg-red-50'
        )}>
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2">
              <Target className={cn(
                'w-5 h-5',
                readiness.readinessLevel === 'ahead'
                  ? 'text-emerald-600'
                  : readiness.readinessLevel === 'on_track'
                  ? 'text-blue-600'
                  : 'text-red-600'
              )} />
              <h3 className="text-lg font-bold text-stone-900">CAT Readiness Assessment</h3>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-white">
              {readiness.readinessLevel === 'ahead'
                ? '✅ Ahead'
                : readiness.readinessLevel === 'on_track'
                ? '⏳ On Track'
                : '⚠️ Not Ready'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-xs text-stone-600 uppercase tracking-wider font-semibold">Current Percentile</p>
              <p className="text-2xl font-bold text-stone-900 mt-1">{readiness.currentPercentile.toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-xs text-stone-600 uppercase tracking-wider font-semibold">Expected Final</p>
              <p className="text-2xl font-bold text-stone-900 mt-1">{readiness.expectedFinalPercentile.toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-xs text-stone-600 uppercase tracking-wider font-semibold">Target</p>
              <p className="text-2xl font-bold text-orange-600 mt-1">{readiness.targetPercentile}%</p>
            </div>
            <div>
              <p className="text-xs text-stone-600 uppercase tracking-wider font-semibold">Days Left</p>
              <p className="text-2xl font-bold text-stone-900 mt-1">{readiness.daysToExam}</p>
            </div>
          </div>

          <p className="text-sm text-stone-700 p-3 bg-white rounded-lg border border-stone-200">
            📊 Daily improvement needed: <span className="font-bold">{readiness.recommendedDailyImprovement.toFixed(2)}</span> percentile points
          </p>
        </Card>
      )}

      {/* Mock Score Trend */}
      {mockTrend && mockTrend.percentiles.length > 0 && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-stone-900">Mock Score Trend</h3>
            <div className="flex items-center gap-2">
              {mockTrend.trend === 'improving' ? (
                <TrendingUp className="w-5 h-5 text-emerald-600" />
              ) : mockTrend.trend === 'declining' ? (
                <TrendingDown className="w-5 h-5 text-red-600" />
              ) : (
                <span className="text-stone-500">→</span>
              )}
              <span className={cn(
                'text-sm font-bold',
                mockTrend.trend === 'improving'
                  ? 'text-emerald-600'
                  : mockTrend.trend === 'declining'
                  ? 'text-red-600'
                  : 'text-stone-600'
              )}>
                {mockTrend.trend.charAt(0).toUpperCase() + mockTrend.trend.slice(1)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xs text-stone-600 uppercase tracking-wider">Latest</p>
              <p className="text-xl font-bold text-stone-900 mt-1">
                {mockTrend.percentiles[mockTrend.percentiles.length - 1].toFixed(1)}%
              </p>
            </div>
            <div>
              <p className="text-xs text-stone-600 uppercase tracking-wider">Best</p>
              <p className="text-xl font-bold text-orange-600 mt-1">
                {Math.max(...mockTrend.percentiles).toFixed(1)}%
              </p>
            </div>
            <div>
              <p className="text-xs text-stone-600 uppercase tracking-wider">Trend</p>
              <p className="text-xl font-bold text-stone-900 mt-1">{mockTrend.trendPoints > 0 ? '+' : ''}{mockTrend.trendPoints.toFixed(1)}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Study Intensity */}
      {intensity && (
        <Card className="p-6">
          <h3 className="text-lg font-bold text-stone-900 mb-4">Study Intensity Pattern</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-stone-600 uppercase tracking-wider font-semibold">Avg Hours/Day</p>
              <p className="text-2xl font-bold text-stone-900 mt-1">{intensity.avgHoursPerDay.toFixed(1)}h</p>
            </div>
            <div>
              <p className="text-xs text-stone-600 uppercase tracking-wider font-semibold">Consistency</p>
              <div className="mt-1 flex items-center gap-2">
                <div className="flex-1 h-2 bg-stone-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-orange-600 transition-all"
                    style={{ width: `${intensity.consistencyScore}%` }}
                  />
                </div>
                <span className="text-sm font-bold text-stone-900">{intensity.consistencyScore.toFixed(0)}%</span>
              </div>
            </div>
            <div>
              <p className="text-xs text-stone-600 uppercase tracking-wider font-semibold">Peak Day</p>
              <p className="text-lg font-bold text-stone-900 mt-1">{intensity.peakDay}</p>
            </div>
            <div>
              <p className="text-xs text-stone-600 uppercase tracking-wider font-semibold">Trend</p>
              <p className={cn(
                'text-lg font-bold mt-1',
                intensity.trend === 'increasing'
                  ? 'text-emerald-600'
                  : intensity.trend === 'decreasing'
                  ? 'text-red-600'
                  : 'text-stone-600'
              )}>
                {intensity.trend === 'increasing' ? '📈' : intensity.trend === 'decreasing' ? '📉' : '→'}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Confidence-Stress Correlation */}
      {correlation && (
        <Card className="p-6 border-l-4 border-purple-600 bg-purple-50">
          <h3 className="text-lg font-bold text-stone-900 mb-4">Mental State Analysis</h3>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-xs text-stone-600 uppercase tracking-wider font-semibold">Avg Confidence</p>
              <p className="text-2xl font-bold text-stone-900 mt-1">{correlation.avgConfidence.toFixed(1)}/5</p>
            </div>
            <div>
              <p className="text-xs text-stone-600 uppercase tracking-wider font-semibold">Avg Stress</p>
              <p className="text-2xl font-bold text-stone-900 mt-1">{correlation.avgStress.toFixed(1)}/5</p>
            </div>
          </div>

          <p className="text-sm text-stone-700 p-3 bg-white rounded-lg border border-purple-200">
            💭 <span className="font-semibold">{correlation.insight}</span>
          </p>
        </Card>
      )}
    </div>
  );
}
