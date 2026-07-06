'use client';

import { useEffect, useState } from 'react';
import { Flame, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

const RING_R = 42;
const CIRCUMFERENCE = 2 * Math.PI * RING_R;

interface HeroCardProps {
  themeName: string;
  themeFocus: string;
  daysInTheme: number;
  themeTarget: number;
  currentStreak: number;
  onLogClick: () => void;
  isLoading?: boolean;
  hasLoggedToday: boolean;
  showLogYesterday: boolean;
  onLogYesterdayClick: () => void;
  yesterdayLabel: string;
}

export function HeroCard({
  themeName,
  themeFocus,
  daysInTheme,
  themeTarget,
  currentStreak,
  onLogClick,
  isLoading = false,
  hasLoggedToday,
  showLogYesterday,
  onLogYesterdayClick,
  yesterdayLabel,
}: HeroCardProps) {
  const [animatedDays, setAnimatedDays] = useState(0);

  useEffect(() => {
    // Defer to next frame so CSS transition fires
    const id = requestAnimationFrame(() => setAnimatedDays(daysInTheme));
    return () => cancelAnimationFrame(id);
  }, [daysInTheme]);

  const dashoffset = CIRCUMFERENCE * (1 - Math.min(animatedDays, themeTarget) / themeTarget);

  return (
    <div className="w-full rounded-2xl bg-gradient-to-br from-orange-600 to-orange-700 text-white p-5 shadow-lg space-y-4">
      {/* Monthly theme header */}
      <div>
        <p className="text-xs uppercase tracking-widest opacity-80 font-semibold">{themeName}</p>
        <p className="text-[11px] opacity-55 mt-0.5">{themeFocus}</p>
      </div>

      {/* Ring + streak side-by-side */}
      <div className="flex items-center gap-5">
        {/* 30-day ring */}
        <div className="relative shrink-0">
          <svg width="96" height="96" viewBox="0 0 96 96" className="-rotate-90">
            <circle cx="48" cy="48" r={RING_R} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="7" />
            <circle
              cx="48" cy="48" r={RING_R}
              fill="none"
              stroke="white"
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={dashoffset}
              className="transition-all duration-700 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold leading-none">{daysInTheme}</span>
            <span className="text-[9px] uppercase tracking-wider opacity-65 mt-0.5">/ {themeTarget}</span>
          </div>
        </div>

        {/* Streak info */}
        <div className="flex-1 space-y-1.5">
          <div className="flex items-baseline gap-1.5">
            <Flame className={cn('w-5 h-5', currentStreak > 0 ? 'animate-bounce' : 'opacity-40')} />
            <span className="text-3xl font-bold font-mono leading-none">{currentStreak}</span>
            <span className="text-sm opacity-70">day run</span>
          </div>
          <p className="text-[11px] opacity-55 leading-snug">
            {currentStreak === 0
              ? 'Log today to start your run'
              : `Days in a row · ${daysInTheme}/${themeTarget} this month`}
          </p>
        </div>
      </div>

      {/* Primary CTA */}
      {hasLoggedToday ? (
        <div className="flex items-center gap-2 bg-white/20 rounded-xl px-4 py-3 backdrop-blur-sm">
          <Zap className="w-4 h-4" />
          <span className="text-sm font-semibold">Day {currentStreak} logged ✓</span>
        </div>
      ) : (
        <button
          onClick={() => { navigator.vibrate?.(20); onLogClick(); }}
          disabled={isLoading}
          className={cn(
            'w-full py-3.5 rounded-xl font-semibold transition-all active:scale-[0.98] flex items-center justify-center gap-2',
            'bg-white text-orange-600 hover:bg-orange-50 disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          {isLoading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-orange-600 rounded-full animate-spin" />
              Loading...
            </>
          ) : (
            <>
              <Zap className="w-5 h-5" />
              {currentStreak === 0 ? 'Log your first day' : 'Log Today'}
            </>
          )}
        </button>
      )}

      {/* 1-day backlog CTA — only when yesterday was missed */}
      {showLogYesterday && !hasLoggedToday && (
        <button
          type="button"
          onClick={onLogYesterdayClick}
          className="w-full text-xs text-center text-white/65 hover:text-white/90 transition-colors py-0.5"
        >
          Forgot yesterday ({yesterdayLabel})? Log it.
        </button>
      )}

      {!hasLoggedToday && (
        <p className="text-[10px] text-center opacity-55">Day ends at 3 AM — late-night study counts</p>
      )}
      {hasLoggedToday && (
        <p className="text-[10px] text-center opacity-50">
          0-hour log keeps the record · study hours feed the ring
        </p>
      )}
      {currentStreak < 30 && (
        <p className="text-[10px] text-center opacity-50 -mt-1">
          🎁 Hit a 30-day streak → 1 month CareerRai free
        </p>
      )}
    </div>
  );
}
