'use client';

import { useEffect, useState } from 'react';
import { Flame, Shield, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HeroCardProps {
  currentStreak: number;
  maxStreak: number;
  onLogClick: () => void;
  isLoading?: boolean;
  hasLoggedToday: boolean;
  shieldsRemaining: number;
}

export function HeroCard({
  currentStreak,
  maxStreak,
  onLogClick,
  isLoading = false,
  hasLoggedToday,
  shieldsRemaining,
}: HeroCardProps) {
  const [displayedStreak, setDisplayedStreak] = useState(0);

  useEffect(() => {
    if (displayedStreak === currentStreak) return;

    const duration = 600;
    const startTime = Date.now();
    const startValue = displayedStreak;
    const difference = currentStreak - startValue;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const newValue = Math.floor(startValue + difference * progress);
      setDisplayedStreak(newValue);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [currentStreak, displayedStreak]);

  return (
    <div
      className={cn(
        'w-full rounded-2xl bg-gradient-to-br from-orange-600 to-orange-700 text-white p-6 space-y-4 shadow-lg transition-all duration-300'
      )}
    >
      {/* Top Row: Streak + Shield */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs uppercase tracking-widest opacity-90 font-semibold">Your streak</p>
          <div className="flex items-baseline gap-2 mt-2">
            <Flame className="w-8 h-8 animate-bounce" />
            <span className="text-5xl font-bold font-mono leading-none">{displayedStreak}</span>
            <span className="text-lg opacity-80 font-normal">days</span>
          </div>
          {maxStreak > currentStreak && (
            <p className="text-xs opacity-75 mt-1">
              Max: {maxStreak} days
            </p>
          )}
        </div>

        {/* Shield Badge */}
        {shieldsRemaining > 0 && (
          <div className="flex flex-col items-center gap-1 bg-white/20 rounded-lg px-3 py-2 backdrop-blur-sm">
            <Shield className="w-5 h-5" />
            <span className="text-xs font-bold">{shieldsRemaining}</span>
            <span className="text-[10px] leading-none">left</span>
          </div>
        )}
      </div>

      {/* CTA Button */}
      {hasLoggedToday ? (
        <div className="flex items-center gap-2 bg-white/20 rounded-xl px-4 py-3 backdrop-blur-sm">
          <Zap className="w-5 h-5" />
          <span className="text-sm font-semibold">Day {currentStreak} logged ✓</span>
        </div>
      ) : (
        <button
          onClick={onLogClick}
          disabled={isLoading}
          className={cn(
            'w-full py-3.5 rounded-xl font-semibold transition-all active:scale-[0.98] flex items-center justify-center gap-2',
            'bg-white text-orange-600 hover:bg-orange-50 disabled:opacity-50 disabled:cursor-not-allowed',
            isLoading && 'animate-pulse'
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
              Log Today
            </>
          )}
        </button>
      )}

      {!hasLoggedToday && (
        <p className="text-[11px] text-center opacity-70">Day ends 3 AM — late-night counts</p>
      )}

      {/* Pulse animation indicator when no log */}
      {!hasLoggedToday && (
        <style>{`
          @keyframes pulse-soft {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
          }
          .hero-cta-pulse {
            animation: pulse-soft 2s ease-in-out infinite;
          }
        `}</style>
      )}
    </div>
  );
}
