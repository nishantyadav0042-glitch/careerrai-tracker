'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X } from 'lucide-react';
import ScreenMeetBuddy from './screens/screen-meet-buddy';
import ScreenBaselineTest from './screens/screen-baseline-test';
import ScreenDailyCommitment from './screens/screen-daily-commitment';
import ScreenLogDayOne from './screens/screen-log-day-one';
import { cn } from '@/lib/utils';

interface OnboardingModalProps {
  onComplete: () => void;
}

export function OnboardingModal({ onComplete }: OnboardingModalProps) {
  const supabase = createClient();
  const [currentScreen, setCurrentScreen] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const screens = [
    { title: 'Meet Your Buddy', component: ScreenMeetBuddy },
    { title: 'Your Baseline Test', component: ScreenBaselineTest },
    { title: 'Daily Commitment', component: ScreenDailyCommitment },
    { title: 'Log Day 1', component: ScreenLogDayOne }
  ];

  const CurrentScreen = screens[currentScreen].component;

  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
    }
    getUser();
  }, [supabase]);

  const handleNext = async (data?: any) => {
    if (currentScreen < screens.length - 1) {
      setCurrentScreen(currentScreen + 1);
    } else {
      // Last screen - mark onboarding as complete
      setIsLoading(true);
      try {
        if (!userId) {
          throw new Error('User ID not found');
        }

        const { error } = await supabase
          .from('profiles')
          .update({ onboarding_completed: true })
          .eq('id', userId);

        if (error) throw error;

        // Wait a bit longer to ensure DB update propagates
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Small delay for confetti animation to complete
        setTimeout(() => {
          onComplete();
        }, 500);
      } catch (err) {
        console.error('Onboarding error:', err);
        setError(err instanceof Error ? err.message : 'Failed to complete onboarding');
        setIsLoading(false);
      }
    }
  };

  const handleCompleteWithoutUpdate = async () => {
    // If somehow completing (e.g., X button), ensure DB is updated first
    if (!userId) {
      onComplete();
      return;
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ onboarding_completed: true })
        .eq('id', userId);

      if (error) throw error;

      // Wait for update to propagate
      await new Promise(resolve => setTimeout(resolve, 500));
      onComplete();
    } catch (err) {
      console.error('Error completing onboarding:', err);
      // Force complete even if update failed (user can retry)
      onComplete();
    }
  };

  const handleBack = () => {
    if (currentScreen > 0) {
      setCurrentScreen(currentScreen - 1);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 pointer-events-auto">
      <div className="w-full max-w-md max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden pointer-events-auto">
        {/* Header with Progress */}
        <div className="bg-white border-b border-stone-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
              {screens[currentScreen].title}
            </h2>
            <button
              onClick={handleCompleteWithoutUpdate}
              disabled={isLoading}
              className="text-stone-400 hover:text-stone-600 transition disabled:opacity-50"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Progress Indicator */}
          <div className="flex gap-2">
            {screens.map((_, i) => (
              <div
                key={i}
                className={cn(
                  'h-1 flex-1 rounded-full transition-all',
                  i <= currentScreen ? 'bg-orange-600' : 'bg-stone-200'
                )}
              />
            ))}
          </div>
          <p className="text-xs text-stone-500 mt-3">
            Screen {currentScreen + 1}/{screens.length}
          </p>
        </div>

        {/* Screen Content */}
        <div className="flex-1 overflow-y-auto p-6 pointer-events-auto">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {userId ? (
            <CurrentScreen
              onNext={handleNext}
              onBack={handleBack}
              canGoBack={currentScreen > 0}
              isLoading={isLoading}
            />
          ) : (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="w-12 h-12 bg-orange-100 rounded-full mx-auto mb-3 animate-pulse" />
                <p className="text-sm text-stone-600">Loading...</p>
              </div>
            </div>
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="border-t border-stone-200 p-6 bg-stone-50 flex gap-3 pointer-events-auto">
          {currentScreen > 0 && (
            <button
              onClick={handleBack}
              disabled={isLoading}
              type="button"
              className="flex-1 py-3 px-4 border border-stone-300 text-stone-900 rounded-xl font-medium hover:bg-stone-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
            >
              Back
            </button>
          )}
          <button
            onClick={() => handleNext()}
            disabled={isLoading}
            type="button"
            className={cn(
              'flex-1 py-3 px-4 rounded-xl font-medium transition-all active:scale-95',
              currentScreen === screens.length - 1
                ? 'bg-orange-600 text-white hover:bg-orange-700'
                : 'bg-orange-600 text-white hover:bg-orange-700',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {isLoading ? 'Loading...' : currentScreen === screens.length - 1 ? 'Enter Dashboard' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
