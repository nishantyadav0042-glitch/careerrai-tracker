'use client';

import { useState } from 'react';
import { Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DailyPuzzleCardProps {
  puzzleDate: string;
  puzzleType: string;
  difficulty: number;
  estimatedTime: number;
  isSolved: boolean;
  timeTaken?: number;
  accuracy?: number;
  onSolve: () => void;
}

export function DailyPuzzleCard({
  puzzleDate,
  puzzleType,
  difficulty,
  estimatedTime,
  isSolved,
  timeTaken,
  accuracy,
  onSolve,
}: DailyPuzzleCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const difficultyLabel = difficulty <= 3 ? 'Easy' : difficulty <= 6 ? 'Medium' : 'Hard';
  const difficultyColor = difficulty <= 3 ? 'green' : difficulty <= 6 ? 'amber' : 'red';

  const date = new Date(puzzleDate + 'T00:00:00');
  const dateStr = date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });

  return (
    <div
      className={cn(
        'rounded-2xl border-2 p-4 transition-all',
        isSolved
          ? 'bg-emerald-50 border-emerald-200'
          : 'bg-orange-50 border-orange-200'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            {isSolved ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            ) : (
              <AlertCircle className="w-5 h-5 text-orange-600" />
            )}
            <span className="text-xs uppercase tracking-widest font-semibold text-stone-600">
              {puzzleType}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-stone-900">
            Daily LRDI Puzzle
          </h3>
          <p className="text-xs text-stone-500 mt-0.5">
            {dateStr}
          </p>
        </div>

        {/* Difficulty Badge */}
        <div
          className={cn(
            'px-2.5 py-1 rounded-full text-xs font-semibold',
            difficultyColor === 'green'
              ? 'bg-green-100 text-green-700'
              : difficultyColor === 'amber'
              ? 'bg-amber-100 text-amber-700'
              : 'bg-red-100 text-red-700'
          )}
        >
          {difficultyLabel}
        </div>
      </div>

      {/* Content */}
      {isSolved && timeTaken ? (
        <div className="mt-4 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-stone-600">Time taken</span>
            <span className="font-semibold text-stone-900">{timeTaken}m</span>
          </div>
          {accuracy !== undefined && (
            <div className="flex items-center justify-between">
              <span className="text-stone-600">Accuracy</span>
              <span className="font-semibold text-stone-900">
                {Math.round(accuracy * 100)}%
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2 text-xs text-stone-600">
          <Clock className="w-4 h-4" />
          <span>Est. {estimatedTime} min</span>
        </div>
      )}

      {/* CTA */}
      {!isSolved && (
        <button
          onClick={onSolve}
          className="w-full mt-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-semibold text-sm transition-colors active:scale-[0.98]"
        >
          Solve Now →
        </button>
      )}

      {/* Expand Details */}
      {isSolved && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full mt-3 text-xs text-emerald-700 font-medium hover:underline"
        >
          {isExpanded ? '▼ Hide' : '▶ View Solution'}
        </button>
      )}

      {/* Solution (if expanded) */}
      {isExpanded && isSolved && (
        <div className="mt-3 pt-3 border-t border-emerald-200">
          <p className="text-xs text-stone-700 leading-relaxed">
            Solution details would load here in Phase 2.
          </p>
        </div>
      )}
    </div>
  );
}
