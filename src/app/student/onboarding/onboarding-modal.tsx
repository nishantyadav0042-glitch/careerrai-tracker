'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import ScreenDreamColleges from './screens/screen-dream-colleges';
import ScreenExamContext from './screens/screen-exam-context';
import ScreenMeetBuddy from './screens/screen-meet-buddy';
import ScreenBaselineTest from './screens/screen-baseline-test';
import ScreenAboutYou from './screens/screen-about-you';
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
    { title: 'Your Dream Colleges', component: ScreenDreamColleges }, // 0
    { title: 'Exam Context', component: ScreenExamContext },           // 1
    { title: 'Meet Your Buddy', component: ScreenMeetBuddy },         // 2
    { title: 'Your Baseline', component: ScreenBaselineTest },         // 3
    { title: 'About You', component: ScreenAboutYou },                // 4
    { title: 'Daily Commitment', component: ScreenDailyCommitment },  // 5
    { title: 'Log Day 1', component: ScreenLogDayOne },               // 6
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

    // Screen 0 = Dream Colleges; save immediately
    if (currentScreen === 0 && data?.dream_colleges) {
      void supabase.from('profiles').update({ dream_colleges: data.dream_colleges }).eq('id', userId ?? '');
    }
    // Screen 1 = Exam Context; save immediately
    if (currentScreen === 1 && data) {
      void supabase.from('profiles').update({
        is_repeater: data.is_repeater,
        category: data.category ?? null,
        exam_target: data.exam_target ?? null,
        attempt_year: data.attempt_year ?? null,
        target_percentile: data.target_percentile ?? null,
        hours_available: data.hours_available,
        study_target_hours: data.hours_available,
      }).eq('id', userId ?? '');
    }
    // Screen 4 = About You; save immediately
    if (currentScreen === 4 && data) {
      void supabase.from('profiles').update({
        full_name: data.full_name || null,
        phone: data.phone || null,
        college: data.college || null,
        course_year: data.course_year ?? null,
        is_working_professional: data.is_working_professional ?? false,
        work_ex_months: data.work_ex_months ?? null,
        coaching_enrolled: data.coaching_enrolled ?? false,
      }).eq('id', userId ?? '');
    }
    // Screen 5 = Daily Commitment; capture target hours
    if (currentScreen === 5 && data?.studyTargetHours) {
      setStudyTargetHours(data.studyTargetHours as number);
    }

    if (currentScreen < screens.length - 1) {
      setCurrentScreen(currentScreen + 1);
    } else {
      // Last screen — persist EVERYTHING the user entered in ONE awaited write.
      // The per-screen saves above are best-effort (fire-and-forget); this is the
      // source of truth, so a failed/raced intermediate save can never leave the
      // profile as "New User" or drop the college/goals.
      setIsLoading(true);
      try {
        if (!userId) throw new Error('User ID not found');

        const merged: Record<string, unknown> = { ...onboardingData, ...(data ?? {}) };
        const update: Record<string, unknown> = {
          onboarding_completed: true,
          study_target_hours: studyTargetHours,
        };
        if (typeof merged.full_name === 'string' && merged.full_name.trim()) update.full_name = merged.full_name.trim();
        if (merged.college) update.college = merged.college;
        if (merged.dream_colleges) update.dream_colleges = merged.dream_colleges;
        if (merged.target_percentile != null) update.target_percentile = merged.target_percentile;
        if (merged.attempt_year != null) update.attempt_year = merged.attempt_year;
        if (merged.is_repeater != null) update.is_repeater = merged.is_repeater;
        if (merged.category != null) update.category = merged.category;
        if (typeof merged.is_working_professional === 'boolean') update.is_working_professional = merged.is_working_professional;
        if (merged.work_ex_months != null) update.work_ex_months = merged.work_ex_months;
        if (typeof merged.coaching_enrolled === 'boolean') update.coaching_enrolled = merged.coaching_enrolled;
        if (merged.course_year != null) update.course_year = merged.course_year;

        const { error } = await supabase.from('profiles').update(update).eq('id', userId).select();
        if (error) throw error;

        await new Promise(resolve => setTimeout(resolve, 1200));
        onComplete();
      } catch (err) {
        console.error('Onboarding error:', err);
        // Supabase PostgrestError may not be an Error instance — read .message
        // off any shape so the student (and we) see the real reason.
        const message = (err as { message?: string })?.message;
        setError(message ?? 'Failed to complete onboarding. Please try again.');
        setIsLoading(false);
      }
    }
  };

  const handleBack = () => {
    if (currentScreen > 0) setCurrentScreen(currentScreen - 1);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-white border-b border-stone-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
              {screens[currentScreen].title}
            </h2>
          </div>

          {/* Progress */}
          <div className="flex gap-2">
            {screens.map((_, i) => (
              <div
                key={i}
                className={cn('h-1 flex-1 rounded-full transition-all', i <= currentScreen ? 'bg-orange-600' : 'bg-stone-200')}
              />
            ))}
          </div>
          <p className="text-xs text-stone-500 mt-3">Screen {currentScreen + 1}/{screens.length}</p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <p>{error}</p>
            </div>
          )}

          <CurrentScreen
            onNext={handleNext}
            onBack={handleBack}
            canGoBack={currentScreen > 0}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
}
