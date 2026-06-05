'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AlertCircle, Zap } from 'lucide-react';
import { shouldShowStreakGuard } from '@/lib/streak-utils';

interface StreakGuardProps {
  userId: string;
  onLogClick: () => void;
}

interface StreakData {
  current_streak: number;
  longest_streak: number;
  last_log_date: string | null;
  milestone_sent_7: boolean;
  milestone_sent_21: boolean;
}

export function StreakGuard({ userId, onLogClick }: StreakGuardProps) {
  const supabase = createClient();
  const [streakData, setStreakData] = useState<StreakData | null>(null);
  const [showGuard, setShowGuard] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date().getHours());

  useEffect(() => {
    async function loadData() {
      try {
        const { data } = await supabase
          .from('streak_data')
          .select('*')
          .eq('student_id', userId)
          .single();

        setStreakData(data || null);
      } catch (error) {
        console.log('No streak data yet');
        setStreakData(null);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();

    // Update time every minute
    const timer = setInterval(() => {
      setCurrentTime(new Date().getHours());
    }, 60000);

    return () => clearInterval(timer);
  }, [supabase, userId]);

  // Check if guard should show
  useEffect(() => {
    const shouldShow = shouldShowStreakGuard(streakData);
    setShowGuard(shouldShow);
  }, [streakData, currentTime]);

  if (isLoading || !showGuard) return null;

  const streak = streakData?.current_streak || 0;
  const isActiveStreak = streak > 0;

  return (
    <div className="fixed bottom-6 right-6 z-40 max-w-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className={`rounded-lg shadow-lg p-4 border-l-4 ${
        isActiveStreak
          ? 'bg-gradient-to-r from-orange-50 to-orange-100 border-orange-600'
          : 'bg-gradient-to-r from-red-50 to-red-100 border-red-600'
      }`}>
        <div className="flex gap-3">
          {isActiveStreak ? (
            <Zap className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          )}

          <div className="flex-1">
            {isActiveStreak ? (
              <>
                <p className="font-semibold text-orange-900">
                  🔥 {streak}-day streak at risk
                </p>
                <p className="text-sm text-orange-800 mt-1">
                  Don't miss today. Log your study session now.
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold text-red-900">
                  Time to start a streak
                </p>
                <p className="text-sm text-red-800 mt-1">
                  Log your first study session and build consistency.
                </p>
              </>
            )}

            <button
              onClick={onLogClick}
              className={`mt-3 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                isActiveStreak
                  ? 'bg-orange-600 text-white hover:bg-orange-700'
                  : 'bg-red-600 text-white hover:bg-red-700'
              }`}
            >
              Log Now →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
