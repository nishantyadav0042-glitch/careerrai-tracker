'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import ScreenDreamColleges from './screens/screen-dream-colleges';
import ScreenExamContext from './screens/screen-exam-context';
import ScreenAboutYou from './screens/screen-about-you';
import ScreenDailyCommitment from './screens/screen-daily-commitment';
import ScreenWeakFocus from './screens/screen-weak-focus';
import ScreenCurrentStage from './screens/screen-current-stage';
import ScreenBiggestBlocker from './screens/screen-biggest-blocker';
import ScreenTopicCoverage from './screens/screen-topic-coverage';
import ScreenBaselineTest from './screens/screen-baseline-test';
import ScreenMeetBuddy from './screens/screen-meet-buddy';
import ScreenBlueprintReveal from './screens/screen-blueprint-reveal';
import { cn } from '@/lib/utils';

interface OnboardingModalProps {
  onComplete: () => void;
}

// Onboarding IS Blueprint generation now — every screen here either feeds
// the planning engine directly or explains a real signal it's about to
// use. What used to be split into a 7-screen wizard here plus a SEPARATE
// "quick setup" gate discovered later on the homepage (weakest section,
// topic, stage, blocker) is now one flow, ending in a real reveal of the
// Blueprint the engine already built — not a "form submitted" screen.
export function OnboardingModal({ onComplete }: OnboardingModalProps) {
  const supabase = createClient();
  const [currentScreen, setCurrentScreen] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const screens = [
    { title: 'Your Dream Colleges', component: ScreenDreamColleges }, // 0
    { title: 'Exam Context', component: ScreenExamContext },           // 1
    { title: 'About You', component: ScreenAboutYou },                 // 2
    { title: 'Daily Commitment', component: ScreenDailyCommitment },   // 3
    { title: 'Your Toughest Section', component: ScreenWeakFocus },    // 4
    { title: 'Where You Are', component: ScreenCurrentStage },         // 5
    { title: 'Your Biggest Blocker', component: ScreenBiggestBlocker },// 6
    { title: 'Topic Coverage', component: ScreenTopicCoverage },       // 7
    { title: 'Your Baseline', component: ScreenBaselineTest },         // 8
    { title: 'Meet Your Buddy', component: ScreenMeetBuddy },          // 9
    { title: 'Your Blueprint', component: ScreenBlueprintReveal },     // 10
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
    setError(null);

    try {
      // Screen 0 = Dream Colleges
      if (currentScreen === 0 && data?.dream_colleges) {
        setIsLoading(true);
        const { error: e } = await supabase.from('profiles').update({ dream_colleges: data.dream_colleges }).eq('id', userId ?? '');
        if (e) throw e;
      }
      // Screen 1 = Exam Context
      if (currentScreen === 1 && data) {
        setIsLoading(true);
        const { error: e } = await supabase.from('profiles').update({
          is_repeater: data.is_repeater,
          category: data.category ?? null,
          exam_target: data.exam_target ?? null,
          attempt_year: data.attempt_year ?? null,
          target_percentile: data.target_percentile ?? null,
        }).eq('id', userId ?? '');
        if (e) throw e;
      }
      // Screen 2 = About You
      if (currentScreen === 2 && data) {
        setIsLoading(true);
        const { error: e } = await supabase.from('profiles').update({
          full_name: data.full_name || null,
          phone: data.phone || null,
          college: data.college || null,
          course_year: data.course_year ?? null,
          is_working_professional: data.is_working_professional ?? false,
          work_ex_months: data.work_ex_months ?? null,
          coaching_enrolled: data.coaching_enrolled ?? false,
        }).eq('id', userId ?? '');
        if (e) throw e;
      }
      // Screen 3 = Daily Commitment
      if (currentScreen === 3 && data?.studyTargetHours) {
        const hours = data.studyTargetHours as number;
        setStudyTargetHours(hours);
        setIsLoading(true);
        const { error: e } = await supabase.from('profiles').update({
          study_target_hours: hours,
          hours_available: hours,
        }).eq('id', userId ?? '');
        if (e) throw e;
      }
      // Screen 6 = Biggest Blocker — the last of the 3 taps (weak focus, stage,
      // blocker); all 4 fields are now known, so persist them in ONE call
      // through the same tested endpoint the old post-onboarding "quick
      // setup" gate used. Awaited (not fire-and-forget) because the very
      // next screen (Topic Coverage) seeds itself from current_stage.
      if (currentScreen === 6 && data?.biggest_blocker) {
        const merged = { ...onboardingData, ...data };
        setIsLoading(true);
        const res = await fetch('/api/routine/quick-setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            weakest_section: merged.weakest_section,
            weak_topic: merged.weak_topic ?? '',
            current_stage: merged.current_stage,
            biggest_blocker: merged.biggest_blocker,
          }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json?.error ?? 'Could not save your focus and blocker.');
        }
      }

      if (currentScreen < screens.length - 1) {
        setCurrentScreen(currentScreen + 1);
        setIsLoading(false);
      } else {
        // Last screen (Blueprint Reveal) — persist everything the user
        // entered in one final awaited write. The per-screen saves above are
        // already awaited, but this is still the source of truth for the
        // profile fields, so a partial failure earlier can never leave
        // onboarding_completed=true with a half-filled profile.
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

        const { error: finalError } = await supabase.from('profiles').update(update).eq('id', userId).select();
        if (finalError) throw finalError;

        onComplete();
      }
    } catch (err) {
      console.error('Onboarding error:', err);
      const message = (err as { message?: string })?.message;
      setError(message ?? 'Something went wrong. Please try again.');
      setIsLoading(false);
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
          <div className="flex gap-1.5">
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
