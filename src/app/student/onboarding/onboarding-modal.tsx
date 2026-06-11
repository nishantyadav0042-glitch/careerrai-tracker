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

  const [studyTargetHours, setStudyTargetHours] = useState<number>(2);

  const handleNext = async (data?: any) => {
    // Screen 2 (index 2) = Daily Commitment — save the target hours
    if (currentScreen === 2 && data?.studyTargetHours) {
      setStudyTargetHours(data.studyTargetHours);
    }

    if (currentScreen < screens.length - 1) {
      setCurrentScreen(currentScreen + 1);
    } else {
      // Last screen - mark onboarding as complete
      setIsLoading(true);
      try {
        if (!userId) {
          throw new Error('User ID not found');
        }

        console.log('Updating onboarding_completed for user:', userId);

        const { data: updateResult, error } = await supabase
          .from('profiles')
          .update({ onboarding_completed: true, study_target_hours: studyTargetHours })
          .eq('id', userId)
          .select();

        console.log('Update result:', updateResult, 'Error:', error);

        if (error) throw error;

        // Wait 2 seconds to ensure DB update propagates
        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log('Calling onComplete after DB update');
        onComplete();
      } catch (err) {
        console.error('Onboarding error:', err);
        setError(err instanceof Error ? err.message : 'Failed to complete onboarding. Try closing and reopening.');
        setIsLoading(false);
      }
    }
  };

  const handleCompleteWithoutUpdate = async () => {
    if (!userId) {
      onComplete();
      return;
    }

    try {
      console.log('Completing onboarding for user:', userId);

      // Try to update database
      const { error } = await supabase
        .from('profiles')
        .update({ onboarding_completed: true })
        .eq('id', userId);

      if (error) {
        console.warn('DB update failed:', error);
      } else {
        console.log('DB update successful');
      }

      // Set localStorage emergency bypass
      localStorage.setItem(`onboarding_skip_${userId}`, 'true');
      console.log('Set localStorage bypass for user:', userId);

      // Wait for update to propagate
      await new Promise(resolve => setTimeout(resolve, 1000));
      onComplete();
    } catch (err) {
      console.error('Error completing onboarding:', err);
      // Set localStorage bypass even if DB failed
      if (userId) {
        localStorage.setItem(`onboarding_skip_${userId}`, 'true');
      }
      onComplete();
    }
  };

  const handleBack = () => {
    if (currentScreen > 0) {
      setCurrentScreen(currentScreen - 1);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header with Progress */}
        <div className="bg-white border-b border-stone-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
              {screens[currentScreen].title}
            </h2>
            <div className="flex gap-2">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleCompleteWithoutUpdate();
                }}
                disabled={isLoading}
                type="button"
                className="text-xs px-2 py-1 text-stone-500 hover:text-stone-700 hover:bg-stone-100 rounded transition disabled:opacity-50 cursor-pointer"
                title="Skip onboarding"
              >
                Skip
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleCompleteWithoutUpdate();
                }}
                disabled={isLoading}
                type="button"
                className="text-stone-400 hover:text-stone-600 transition disabled:opacity-50 cursor-pointer"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
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
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <p>{error}</p>
              <button
                onClick={() => {
                  console.log('Force skipping onboarding...');
                  handleCompleteWithoutUpdate();
                }}
                type="button"
                className="mt-2 text-xs underline hover:text-red-900 cursor-pointer"
              >
                Click here to skip
              </button>
            </div>
          )}

          <CurrentScreen
            onNext={handleNext}
            onBack={handleBack}
            canGoBack={currentScreen > 0}
            isLoading={isLoading}
          />
        </div>

        {/* Navigation Buttons */}
        <div className="border-t border-stone-200 p-6 bg-stone-50 flex gap-3">
          {currentScreen > 0 && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleBack();
              }}
              disabled={isLoading}
              type="button"
              className="flex-1 py-3 px-4 border border-stone-300 text-stone-900 rounded-xl font-medium hover:bg-stone-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              Back
            </button>
          )}
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleNext();
            }}
            disabled={isLoading}
            type="button"
            className={cn(
              'flex-1 py-3 px-4 rounded-xl font-medium transition-all active:scale-[0.98] cursor-pointer',
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
