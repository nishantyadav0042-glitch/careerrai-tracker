'use client';

import { useState } from 'react';
import { Clock, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type GameType = 'detective' | 'airport' | 'escape_room' | 'mafia';

interface DailyPuzzleCardProps {
  puzzleDate: string;
  puzzleType: string;
  gameType?: GameType;
  difficulty: number;
  estimatedTime: number;
  isSolved: boolean;
  title?: string;
  timeTaken?: number;
  accuracy?: number;
  solution?: string;
  explanation?: string;
  onSolve: () => void;
}

const typeLabels: Record<string, string> = {
  seating: 'Seating Arrangement',
  blood_relation: 'Blood Relations',
  constraint: 'Logical Constraints',
  arrangement: 'Ordering & Ranking',
};

const gameTheme: Record<GameType, {
  emoji: string; prefix: string; cta: string; tag: string;
  accent: string; ctaBg: string; badge: string;
}> = {
  detective: {
    emoji: '🕵️', prefix: 'Case File', cta: "🔍 Open today's case",
    tag: 'A real CAT LRDI set in disguise',
    accent: 'text-amber-400', ctaBg: 'bg-amber-500 hover:bg-amber-400', badge: 'bg-amber-400/20 text-amber-300',
  },
  airport: {
    emoji: '✈️', prefix: 'Flight Log', cta: "📡 Take the controller's seat",
    tag: 'CAT arrangement set — ATC edition',
    accent: 'text-sky-300', ctaBg: 'bg-sky-400 hover:bg-sky-300', badge: 'bg-sky-400/20 text-sky-300',
  },
  escape_room: {
    emoji: '🔐', prefix: 'Escape Room', cta: '🔐 Enter the room',
    tag: 'Crack CAT Quant locks to escape',
    accent: 'text-emerald-300', ctaBg: 'bg-emerald-400 hover:bg-emerald-300', badge: 'bg-emerald-400/20 text-emerald-300',
  },
  mafia: {
    emoji: '🎭', prefix: 'Mafia Round', cta: '🎭 Find the liar',
    tag: 'CAT truth-liar deduction set',
    accent: 'text-red-300', ctaBg: 'bg-red-400 hover:bg-red-300', badge: 'bg-red-400/20 text-red-300',
  },
};

export function DailyPuzzleCard({
  puzzleDate,
  puzzleType,
  gameType = 'detective',
  difficulty,
  estimatedTime,
  isSolved,
  title,
  timeTaken,
  accuracy,
  solution,
  explanation,
  onSolve,
}: DailyPuzzleCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const theme = gameTheme[gameType];

  const difficultyLabel = difficulty <= 4 ? 'Medium' : difficulty <= 6 ? 'Medium+' : 'Hard';
  const date = new Date(puzzleDate + 'T00:00:00');
  const dateStr = date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  const caseNumber = puzzleDate.replace(/-/g, '').slice(2);

  return (
    <div
      className={cn(
        'rounded-2xl border-2 p-4 transition-all',
        isSolved ? 'bg-emerald-50 border-emerald-200' : 'bg-stone-900 border-stone-800'
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            {isSolved ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <span className="text-base leading-none">{theme.emoji}</span>
            )}
            <span
              className={cn(
                'text-[10px] uppercase tracking-widest font-semibold',
                isSolved ? 'text-emerald-700' : theme.accent
              )}
            >
              {theme.prefix} #{caseNumber}
            </span>
          </div>
          <h3 className={cn('text-sm font-bold', isSolved ? 'text-stone-900' : 'text-white')}>
            {title || "Today's LRDI Mystery"}
          </h3>
          <p className={cn('text-xs mt-0.5', isSolved ? 'text-stone-500' : 'text-stone-400')}>
            {typeLabels[puzzleType] || puzzleType} · {dateStr}
          </p>
        </div>

        <div
          className={cn(
            'px-2.5 py-1 rounded-full text-xs font-semibold',
            isSolved ? 'bg-emerald-100 text-emerald-700' : theme.badge
          )}
        >
          {difficultyLabel}
        </div>
      </div>

      {isSolved && timeTaken ? (
        <div className="mt-4 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-stone-600">Solved in</span>
            <span className="font-semibold text-stone-900">{timeTaken}m</span>
          </div>
          {accuracy !== undefined && (
            <div className="flex items-center justify-between">
              <span className="text-stone-600">Questions correct</span>
              <span className="font-semibold text-stone-900">{Math.round(accuracy * 100)}%</span>
            </div>
          )}
        </div>
      ) : (
        <div className={cn('mt-3 flex items-center gap-2 text-xs', isSolved ? 'text-stone-600' : 'text-stone-400')}>
          <Clock className="w-4 h-4" />
          <span>~{estimatedTime} min · {theme.tag}</span>
        </div>
      )}

      {!isSolved && (
        <button
          onClick={onSolve}
          className={cn(
            'w-full mt-4 py-2.5 text-stone-900 rounded-lg font-bold text-sm transition-colors active:scale-[0.98]',
            theme.ctaBg
          )}
        >
          {theme.cta}
        </button>
      )}

      {isSolved && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full mt-3 text-xs text-emerald-700 font-medium hover:underline"
        >
          {isExpanded ? '▼ Hide' : '▶ View the method'}
        </button>
      )}

      {isExpanded && isSolved && (
        <div className="mt-3 pt-3 border-t border-emerald-200 space-y-1.5">
          {solution && <p className="text-xs font-semibold text-stone-900">Answer: {solution}</p>}
          <p className="text-xs text-stone-700 leading-relaxed">
            {explanation || 'No explanation available.'}
          </p>
        </div>
      )}
    </div>
  );
}
