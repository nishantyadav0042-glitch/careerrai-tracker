'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Award, TrendingUp, Zap, Target, Calendar } from 'lucide-react';
import { getDetailedFeedback, estimateImprovement } from '@/lib/cat-percentile-data';

interface CATResultProps {
  score: number;
  categories: Record<string, number>;
  onComplete: () => void;
}

export function CATResult({ score, categories, onComplete }: CATResultProps) {
  const feedback = getDetailedFeedback(score, categories);
  const improvement = estimateImprovement(score, 20); // Assume 20 hours/week avg

  const getScoreBgColor = () => {
    const p = feedback.overall.percentile;
    if (p >= 99) return 'from-orange-600 to-orange-700';
    if (p >= 95) return 'from-orange-500 to-orange-600';
    if (p >= 90) return 'from-orange-400 to-orange-500';
    if (p >= 80) return 'from-amber-500 to-orange-400';
    if (p >= 70) return 'from-amber-400 to-amber-500';
    return 'from-stone-400 to-stone-500';
  };

  return (
    <div className="fixed inset-0 bg-stone-900/95 z-50 overflow-y-auto">
      <div className="min-h-screen flex items-center justify-center p-4 py-12">
        <Card className="w-full max-w-2xl p-6 md:p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <Award className="w-12 h-12 text-orange-600" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
              Test Complete!
            </h1>
            <p className="text-sm text-stone-500 mt-2">Your CAT Readiness Test</p>
          </div>

          {/* Score Display */}
          <div className={`bg-gradient-to-br ${getScoreBgColor()} rounded-2xl p-8 text-white mb-6`}>
            <div className="text-center">
              <div className="text-7xl md:text-8xl font-bold font-mono mb-2">
                {String(Math.round(score)).padStart(3, '0')}
              </div>
              <div className="text-lg opacity-90">out of 300</div>
              <div className="mt-4 pt-4 border-t border-white/20">
                <div className="text-3xl font-bold">{String(Math.round(feedback.overall.percentile)).padStart(2, '0')}%ile</div>
                <div className="text-sm opacity-90 mt-1">{feedback.overall.interpretation}</div>
              </div>
            </div>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Card className="p-3 text-center">
              <div className="text-xs uppercase text-stone-500 font-semibold">Benchmark</div>
              <div className="text-lg font-bold text-stone-900 mt-1">{feedback.overall.benchmark}</div>
            </Card>
            <Card className="p-3 text-center">
              <div className="text-xs uppercase text-stone-500 font-semibold">Success Rate</div>
              <div className="text-lg font-bold text-emerald-700 mt-1">{feedback.overall.success_rate}%</div>
            </Card>
            <Card className="p-3 text-center">
              <div className="text-xs uppercase text-stone-500 font-semibold">8-Week Est.</div>
              <div className="text-lg font-bold text-orange-700 mt-1">{improvement.estimated_8week_score}</div>
            </Card>
            <Card className="p-3 text-center">
              <div className="text-xs uppercase text-stone-500 font-semibold">Monthly Gain</div>
              <div className="text-lg font-bold text-blue-700 mt-1">+{improvement.monthly_improvement}</div>
            </Card>
          </div>

          {/* Target Colleges */}
          {feedback.overall.target_colleges.length > 0 && (
            <Card className="p-4 mb-6 bg-blue-50 border-blue-200">
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-semibold uppercase text-blue-700">Target Colleges</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {feedback.overall.target_colleges.map((college) => (
                  <Badge key={college} color="blue">{college}</Badge>
                ))}
              </div>
            </Card>
          )}

          {/* Personalized Feedback */}
          <Card className="p-4 mb-6 bg-emerald-50 border-emerald-200">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-semibold uppercase text-emerald-700">AI Feedback</span>
            </div>
            <p className="text-sm text-emerald-800 font-medium">{feedback.motivation}</p>
          </Card>

          {/* Comparison */}
          <Card className="p-4 mb-6 bg-purple-50 border-purple-200">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-purple-600" />
              <span className="text-xs font-semibold uppercase text-purple-700">Your Progress</span>
            </div>
            <div className="space-y-2">
              <div className="text-sm">
                <span className="text-purple-900 font-medium">{feedback.comparison.vs_90_percentile}</span>
              </div>
              <div className="text-sm">
                <span className="text-purple-800">{feedback.comparison.vs_99_percentile}</span>
              </div>
            </div>
          </Card>

          {/* Category Breakdown */}
          {feedback.categories && Object.keys(feedback.categories).length > 0 && (
            <Card className="p-4 mb-6 bg-indigo-50 border-indigo-200">
              <div className="text-xs font-semibold uppercase text-indigo-700 mb-4">Category Performance</div>
              <div className="space-y-3">
                {(Object.entries(feedback.categories) as [string, { score: number; action: string }][]).map(([category, data]) => (
                  <div key={category} className="pb-3 border-b border-indigo-200 last:border-b-0">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-indigo-900">{category}</span>
                      <span className="text-sm font-bold text-indigo-700">{data.score}%</span>
                    </div>
                    <div className="w-full bg-indigo-200 rounded-full h-2 mb-2">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          data.score >= 75 ? 'bg-emerald-500' :
                          data.score >= 50 ? 'bg-amber-500' :
                          'bg-rose-500'
                        }`}
                        style={{ width: `${Math.min(data.score, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-indigo-800">{data.action}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Next Steps */}
          <Card className="p-4 mb-6 bg-amber-50 border-amber-200">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-amber-600" />
              <span className="text-xs font-semibold uppercase text-amber-700">Recommended next steps</span>
            </div>
            <ul className="space-y-2">
              {feedback.next_steps.map((step, i) => (
                <li key={i} className="text-sm text-amber-800">
                  {step}
                </li>
              ))}
            </ul>
          </Card>

          {/* CareerRai Value Proposition */}
          <Card className="p-4 mb-6 bg-gradient-to-br from-orange-50 to-rose-50 border-orange-200">
            <div className="text-sm text-stone-900">
              <p className="font-semibold mb-2">💎 Why CareerRai is Different:</p>
              <ul className="space-y-1 text-xs text-stone-700">
                <li>✓ <strong>Personalised buddy</strong>: not just a test — a real buddy analysing YOUR data</li>
                <li>✓ <strong>Smart Feedback</strong>: AI-powered insights + human touch from your buddy</li>
                <li>✓ <strong>Real Data</strong>: Percentiles based on actual CAT 2023-2025 results</li>
                <li>✓ <strong>Growth Timeline</strong>: Know exactly when you&apos;ll hit your target score</li>
                <li>✓ <strong>Accountability</strong>: Weekly check-ins ensure you stay on track</li>
              </ul>
            </div>
          </Card>

          {/* Action Button */}
          <button
            type="button"
            onClick={onComplete}
            className="w-full py-3 bg-orange-600 text-white rounded-xl font-medium hover:bg-orange-700 transition-all active:scale-[0.98]"
          >
            Save & Continue
          </button>

          {/* Footer Message */}
          <p className="text-xs text-center text-stone-500 mt-4">
            Your buddy will review this and share personalised insights in their feedback.
          </p>
        </Card>
      </div>
    </div>
  );
}
