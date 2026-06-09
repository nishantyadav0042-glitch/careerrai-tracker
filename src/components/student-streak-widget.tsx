'use client';

import { useState, useEffect } from 'react';
import { Flame, Gift, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/client';
import { getStreakStatus, getFlameState } from '@/lib/streak-utils';
import type { StreakData } from '@/lib/streak-utils';

interface StudentStreakWidgetProps {
  studentId: string;
}

const REWARDS_MILESTONES = [
  { days: 7, reward: '3 days free', emoji: '🔥', icon: 'Fire' },
  { days: 14, reward: 'Badge earned', emoji: '💪', icon: 'Strength' },
  { days: 30, reward: '1 MONTH FREE', emoji: '👑', icon: 'Crown' },
  { days: 60, reward: 'Legend status', emoji: '⭐', icon: 'Star' },
];

export function StudentStreakWidget({ studentId }: StudentStreakWidgetProps) {
  const supabase = createClient();
  const [streakData, setStreakData] = useState<StreakData | null>(null);
  const [loading, setLoading] = useState(true);
  const [celebrateReward, setCelebrateReward] = useState(false);

  useEffect(() => {
    fetchStreakData();
  }, []);

  const fetchStreakData = async () => {
    try {
      const { data, error } = await supabase
        .from('streak_data')
        .select('*')
        .eq('student_id', studentId)
        .single();

      if (!error && data) {
        setStreakData(data);

        // Check if just reached 30-day milestone
        if (data.current_streak === 30) {
          setCelebrateReward(true);
          setTimeout(() => setCelebrateReward(false), 4000);
        }
      }
    } catch (err) {
      console.error('Error fetching streak:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-xs text-stone-500">Loading streak...</div>;
  }

  const streakStatus = getStreakStatus(streakData);
  const flameState = getFlameState(streakStatus.days);

  // Find next milestone
  const nextMilestone = REWARDS_MILESTONES.find(m => m.days > streakStatus.days);
  const progressToNext = nextMilestone
    ? Math.min(100, (streakStatus.days / nextMilestone.days) * 100)
    : 100;

  const getFlameColor = () => {
    switch (flameState) {
      case 'none': return 'text-stone-400';
      case 'basic': return 'text-orange-500';
      case 'glowing': return 'text-orange-600';
      case 'gold': return 'text-yellow-500';
      default: return 'text-stone-400';
    }
  };

  const getMilestoneReward = () => {
    const achieved = REWARDS_MILESTONES.filter(m => m.days <= streakStatus.days);
    return achieved.length > 0 ? achieved[achieved.length - 1] : null;
  };

  const currentReward = getMilestoneReward();

  return (
    <div className="space-y-4">
      {/* Main Streak Card */}
      <Card className={`p-6 border-2 transition-all ${
        streakStatus.isActive
          ? 'bg-gradient-to-br from-orange-50 to-amber-50 border-orange-300'
          : 'bg-stone-50 border-stone-200'
      } ${celebrateReward ? 'ring-4 ring-yellow-400' : ''}`}>
        <div className="space-y-4">
          {/* Streak Count */}
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-baseline gap-2">
                <span className={`text-5xl font-bold ${getFlameColor()} ${flameState === 'gold' ? 'animate-pulse' : ''}`}>
                  {streakStatus.days}
                </span>
                <Flame className={`w-8 h-8 ${getFlameColor()}`} />
              </div>
              <p className="text-xs text-stone-600 mt-1">
                {streakStatus.isActive
                  ? '🔥 Keep your streak alive!'
                  : '⏰ Streak broken - Start fresh today'}
              </p>
            </div>

            {/* Best Streak Badge */}
            <div className="text-center">
              <div className="text-2xl font-bold text-teal-700">
                {streakData?.longest_streak || 0}
              </div>
              <p className="text-xs text-stone-600">Best streak</p>
            </div>
          </div>

          {/* Progress to Next Milestone */}
          {nextMilestone && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-stone-700">Next reward: {nextMilestone.reward}</span>
                <span className="text-stone-500">{streakStatus.days}/{nextMilestone.days}</span>
              </div>
              <div className="h-2 bg-stone-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-orange-400 to-orange-600 rounded-full transition-all duration-300"
                  style={{ width: `${progressToNext}%` }}
                />
              </div>
            </div>
          )}

          {/* Current Reward Display */}
          {currentReward && (
            <div className="bg-white rounded-lg p-3 border border-amber-200">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{currentReward.emoji}</span>
                <div>
                  <p className="text-xs font-semibold text-stone-900">Reward Unlocked!</p>
                  <p className="text-xs text-stone-600">{currentReward.reward}</p>
                </div>
              </div>
            </div>
          )}

          {/* Special 30-Day Reward */}
          {streakStatus.days >= 30 && (
            <div className={`bg-gradient-to-r from-yellow-100 to-orange-100 rounded-lg p-4 border-2 border-yellow-400 ${
              streakStatus.days === 30 ? 'ring-2 ring-yellow-300 animate-pulse' : ''
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">👑</span>
                <span className="text-sm font-bold text-yellow-900">30-DAY MASTER</span>
              </div>
              <p className="text-xs text-yellow-800 font-semibold">
                🎉 You've earned 1 MONTH FREE EXTENSION!
              </p>
              <p className="text-xs text-yellow-700 mt-1">
                Your buddy has been notified. Reward will be applied to your account soon.
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* Rewards Timeline */}
      <Card className="p-4 bg-white border border-stone-200">
        <div className="flex items-center gap-2 mb-3">
          <Gift className="w-4 h-4 text-amber-600" />
          <h3 className="text-xs font-semibold text-stone-700 uppercase">Reward Milestones</h3>
        </div>

        <div className="space-y-2">
          {REWARDS_MILESTONES.map((milestone, idx) => {
            const isUnlocked = streakStatus.days >= milestone.days;
            const isCurrent = currentReward?.days === milestone.days;

            return (
              <div
                key={milestone.days}
                className={`flex items-center justify-between p-2 rounded-lg transition-all ${
                  isUnlocked
                    ? 'bg-amber-50 border border-amber-200'
                    : 'bg-stone-50 border border-stone-200 opacity-60'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{milestone.emoji}</span>
                  <div>
                    <p className="text-xs font-medium text-stone-900">{milestone.days} Day Streak</p>
                    <p className="text-xs text-stone-600">{milestone.reward}</p>
                  </div>
                </div>

                {isUnlocked && (
                  <div className="text-xs font-semibold text-green-600">✓ Unlocked</div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Motivational Tips */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
        <p className="text-xs font-semibold text-blue-900">💡 Streak Tips</p>
        <ul className="text-xs text-blue-800 space-y-1">
          <li>✓ Log daily to maintain your streak</li>
          <li>✓ One day missed = streak resets</li>
          <li>✓ Reach 30 days → Get 1 month FREE!</li>
          <li>✓ Share your progress with your buddy</li>
        </ul>
      </div>
    </div>
  );
}
