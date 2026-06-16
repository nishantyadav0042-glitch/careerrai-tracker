'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X } from 'lucide-react';
import ScreenSocialProof from './screens/screen-social-proof';
import ScreenDreamColleges from './screens/screen-dream-colleges';
import ScreenHonesty from './screens/screen-honesty';
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
    { title: 'Meet the Community', component: ScreenSocialProof },
    { title: 'Your Dream Colleges', component: ScreenDreamColleges },
    { title: 'Be Honest With Us', component: ScreenHonesty },
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
  const [onboardingData, setOnboardingData] = useState<Record<string, unknown>>({});

  const handleNext = async (data?: Record<string, unknown>) => {
    if (data) setOnboardingData((prev) => ({ ...prev, ...data }));

    // Screen 1 = Dream Colleges; save immediately
    if (currentScreen === 1 && data?.dream_colleges) {
      supabase.from('profiles').update({ dream_colleges: data.dream_colleges }).eq('id', userId ?? '').then(() => {});
    }
    // Screen 2 = Honesty; save immediately
    if (currentScreen === 2 && data) {
      supabase.from('profiles').update({
        is_repeater: data.is_repeater,
        starting_percentile: data.starting_percentile ?? null,
        hours_available: data.hours_available,
        study_target_hours: data.hours_available,
      }).eq('id', userId ?? '').then(() => {});
    }
    // Screen 5 (Daily Commitment) — save the target hours
    if (currentScreen === 5 && data?.studyTargetHours) {
      setStudyTargetHours(data.studyTargetHours as number);
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
    // Only mark onboarding complete if the user has progressed past screen 0.
    // Closing at screen 0 (without seeing anything) should not permanently
    // suppress the modal — the user should see it again on next visit.
    if (!userId || currentScreen === 0) {
      onComplete();
      return;
    }
    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ onboarding_completed: true })
        .eq('id', userId);
      if (updateError) throw updateError;
      await new Promise(resolve => setTimeout(resolve, 500));
      onComplete();
    } catch {
      setError('Could not save your progress. Please try again.');
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

        {/* Navigation Buttons — screen 0 (ScreenSocialProof) manages its own navigation */}
        {currentScreen > 0 && (
          <div className="border-t border-stone-200 p-6 bg-stone-50 flex gap-3">
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
                'bg-orange-600 text-white hover:bg-orange-700',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {isLoading ? 'Loading...' : currentScreen === screens.length - 1 ? 'Enter Dashboard' : 'Next'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
