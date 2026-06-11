'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Mic, Send, Check, Sparkles, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WeeklyStats {
  daysLogged: number;
  avgHours: string;
  avgStress: string;
  mockTaken: number;
  latestMockScore: number | null;
}

interface WeeklySignalCardProps {
  studentId: string;
  studentName: string;
  onVoiceNote: () => void;
  onFeedback: () => void;
}

export function WeeklySignalCard({ studentId, studentName, onVoiceNote, onFeedback }: WeeklySignalCardProps) {
  const [insight, setInsight] = useState<string | null>(null);
  const [stats, setStats] = useState<WeeklyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [acted, setActed] = useState(false);

  const firstName = studentName.split(' ')[0];

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/weekly-signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId }),
      });
      if (res.ok) {
        const data = await res.json();
        setInsight(data.insight);
        setStats(data.stats);
      }
    } catch (e) {
      console.error('weekly-signal load error', e);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <Card className="p-5 border-2 border-teal-100 bg-gradient-to-br from-teal-50 to-white">
        <div className="h-24 bg-teal-100/60 rounded-xl animate-pulse" />
      </Card>
    );
  }

  if (acted) {
    return (
      <Card className="p-4 border-2 border-emerald-200 bg-emerald-50">
        <div className="flex items-center gap-2 text-emerald-700">
          <Check className="w-4 h-4" />
          <span className="text-sm font-medium">Reviewed this week ✔</span>
        </div>
      </Card>
    );
  }

  const stressNum = stats ? parseFloat(stats.avgStress) : 3;
  const StressTrendIcon = stressNum > 3.5 ? TrendingUp : stressNum < 2.5 ? TrendingDown : Minus;
  const stressColor = stressNum > 3.5 ? 'text-red-600' : stressNum < 2.5 ? 'text-emerald-600' : 'text-stone-500';

  return (
    <Card className="p-5 border-2 border-teal-200 bg-gradient-to-br from-teal-50 to-white">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-4 h-4 text-teal-600" />
        <h3 className="text-sm font-bold text-teal-900">Weekly Signal — {firstName}</h3>
        <span className="ml-auto text-[10px] text-stone-400 uppercase tracking-wider">AI</span>
      </div>

      {/* 2×2 Stats Grid */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-white rounded-xl p-3 border border-stone-100">
            <div className="text-xs text-stone-500 mb-1">Days logged</div>
            <div className="text-2xl font-bold text-stone-900">
              {stats.daysLogged}<span className="text-sm font-normal text-stone-400">/7</span>
            </div>
          </div>
          <div className="bg-white rounded-xl p-3 border border-stone-100">
            <div className="text-xs text-stone-500 mb-1">Avg hours/day</div>
            <div className="text-2xl font-bold text-stone-900">{stats.avgHours}<span className="text-sm font-normal text-stone-400"> hrs</span></div>
          </div>
          <div className="bg-white rounded-xl p-3 border border-stone-100">
            <div className="text-xs text-stone-500 mb-1">Stress trend</div>
            <div className={cn('flex items-center gap-1 text-lg font-bold', stressColor)}>
              <StressTrendIcon className="w-4 h-4" />
              {stats.avgStress}<span className="text-xs font-normal text-stone-400">/5</span>
            </div>
          </div>
          <div className="bg-white rounded-xl p-3 border border-stone-100">
            <div className="text-xs text-stone-500 mb-1">Mock performance</div>
            <div className="text-sm font-semibold text-stone-900">
              {stats.mockTaken === 0
                ? 'No mock'
                : stats.latestMockScore
                ? `${stats.latestMockScore}%ile`
                : `${stats.mockTaken} taken`}
            </div>
          </div>
        </div>
      )}

      {/* AI Insight */}
      {insight && (
        <div className="bg-teal-100/60 rounded-xl p-3 mb-4">
          <p className="text-xs font-semibold text-teal-800 mb-1">AI Observation</p>
          <p className="text-sm text-teal-900 italic">"{insight}"</p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => { onVoiceNote(); setActed(true); }}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-all text-xs font-semibold"
          style={{ minHeight: 44 }}
        >
          <Mic className="w-3.5 h-3.5" />
          Voice note
        </button>
        <button
          onClick={() => { setActed(true); }}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-all text-xs font-semibold"
          style={{ minHeight: 44 }}
        >
          <Check className="w-3.5 h-3.5" />
          Keep going
        </button>
        <button
          onClick={() => { onFeedback(); setActed(true); }}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-teal-100 text-teal-700 rounded-lg hover:bg-teal-200 transition-all text-xs font-semibold"
          style={{ minHeight: 44 }}
        >
          <Send className="w-3.5 h-3.5" />
          Feedback
        </button>
      </div>
    </Card>
  );
}
