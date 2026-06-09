'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { getStreakStatus, getFlameState } from '@/lib/streak-utils';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface StreakHeroProps {
  userId: string;
}

export function StreakHero({ userId }: StreakHeroProps) {
  const supabase = createClient();
  const [streakData, setStreakData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadStreak() {
      try {
        const { data } = await supabase
          .from('streak_data')
          .select('*')
          .eq('student_id', userId)
          .single();

        setStreakData(data);
      } catch (error) {
        console.log('No streak data yet');
        setStreakData(null);
      } finally {
        setIsLoading(false);
      }
    }

    loadStreak();
  }, [supabase, userId]);

  const streakStatus = getStreakStatus(streakData);
  const flameState = getFlameState(streakStatus.days);

  if (isLoading) {
    return (
      <Card className="p-6 bg-gradient-to-r from-stone-800 to-stone-900">
        <div className="h-20 bg-stone-700/50 rounded-lg animate-pulse" />
      </Card>
    );
  }

  // Flame styles based on state
  const getFlameStyles = () => {
    const baseStyles = 'w-16 h-16 transition-all';

    switch (flameState) {
      case 'gold':
        return `${baseStyles} text-yellow-400 animate-pulse drop-shadow-lg`;
      case 'glowing':
        return `${baseStyles} text-orange-500 drop-shadow-md`;
      case 'basic':
        return `${baseStyles} text-orange-600`;
      default:
        return `${baseStyles} text-stone-400`;
    }
  };

  const getStreakColor = () => {
    if (streakStatus.days === 0) return 'text-stone-400';
    if (streakStatus.days < 7) return 'text-orange-600';
    if (streakStatus.days < 14) return 'text-orange-500';
    return 'text-yellow-400';
  };

  const getCardBg = () => {
    if (streakStatus.days === 0) return 'from-stone-700 to-stone-800';
    if (streakStatus.days < 7) return 'from-orange-900 to-stone-800';
    if (streakStatus.days < 14) return 'from-orange-800 to-orange-900';
    return 'from-yellow-900 to-orange-900';
  };

  return (
    <Card className={cn('p-6 bg-gradient-to-r text-white', getCardBg())}>
      <div className="flex items-center justify-between gap-4">
        {/* Flame Icon */}
        <div className="flex flex-col items-center">
          <FlameIcon className={getFlameStyles()} days={streakStatus.days} />
        </div>

        {/* Streak Info */}
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <div className={cn('text-4xl font-bold font-mono', getStreakColor())}>
              {streakStatus.days}
            </div>
            <div className="text-sm opacity-90">
              {streakStatus.days === 1 ? 'day' : 'days'}
            </div>
          </div>

          <p className="text-sm mt-2 opacity-90 leading-relaxed">
            {streakStatus.message}
          </p>

          <p className="text-xs mt-2 opacity-75 italic">
            Your buddy checks your streak every Monday
          </p>
        </div>

        {/* Log Today Button */}
        {streakStatus.isActive && (
          <Link
            href="/student/home?openQuickLog=true"
            className="px-4 py-3 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-semibold transition-all backdrop-blur-sm"
          >
            Log Today
          </Link>
        )}
      </div>

      {/* Rewards & Milestones */}
      <div className="mt-4 pt-4 border-t border-white/20 space-y-3">
        {/* 30-Day Reward (Main CTA) */}
        {streakStatus.days > 0 && streakStatus.days < 30 && (
          <div className="bg-white/10 rounded-lg p-3">
            <p className="text-xs font-semibold text-yellow-200 mb-2">
              🎯 Next Big Goal: 30-Day Streak
            </p>
            <div className="space-y-2">
              <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-yellow-400 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, (streakStatus.days / 30) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-yellow-200">
                {30 - streakStatus.days} days to unlock <strong>1 MONTH FREE EXTENSION</strong>
              </p>
            </div>
          </div>
        )}

        {/* 30-Day Milestone Achieved */}
        {streakStatus.days >= 30 && (
          <div className="bg-yellow-400/20 border border-yellow-300/40 rounded-lg p-3 animate-pulse">
            <p className="text-xs font-bold text-yellow-200 mb-1">
              👑 30-DAY MASTER UNLOCKED!
            </p>
            <p className="text-xs text-yellow-100">
              Congratulations! You've earned <strong>1 MONTH FREE EXTENSION</strong> on your CareerRai subscription.
            </p>
            <p className="text-xs text-yellow-200 mt-2 font-semibold">
              ✓ Reward applied to your account
            </p>
          </div>
        )}

        {/* Generic Milestone Message */}
        {streakStatus.days > 0 && streakStatus.days % 7 === 0 && streakStatus.days < 30 && (
          <p className="text-xs font-semibold text-green-200">
            ✅ {streakStatus.days}-day milestone! Your buddy has been notified.
          </p>
        )}

        {/* Daily Log Reminder */}
        {streakStatus.days > 0 && (
          <p className="text-xs text-white/70">
            💪 <strong>Log daily to keep your streak alive</strong> • Streak resets if you miss a day
          </p>
        )}
      </div>
    </Card>
  );
}

/**
 * Custom Flame Icon Component
 * Shows different styles based on streak duration
 */
interface FlameIconProps {
  className: string;
  days: number;
}

function FlameIcon({ className, days }: FlameIconProps) {
  // Different flame SVG based on state
  if (days === 0) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className={className}
      >
        <path d="M12 1L6 9c-1 2-2 5-2 8 0 5 3.58 9 6 9s6-4 6-9c0-3-1-6-2-8l-2-6z" />
      </svg>
    );
  }

  // Animated flame for active streaks
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={{
        filter: days >= 14 ? 'drop-shadow(0 0 8px currentColor)' : 'none'
      }}
    >
      <g>
        {/* Main flame */}
        <path d="M12 1L6 9c-1 2-2 5-2 8 0 5 3.58 9 6 9s6-4 6-9c0-3-1-6-2-8l-2-6z" />
        {/* Inner highlight for glow effect */}
        {days >= 7 && (
          <path
            d="M11 5L9 9c-0.5 1-1 3-1 5 0 3 2 5 3 5s3-2 3-5c0-2-0.5-4-1-5l-2-4z"
            fill="rgba(255,255,255,0.3)"
          />
        )}
      </g>
    </svg>
  );
}
