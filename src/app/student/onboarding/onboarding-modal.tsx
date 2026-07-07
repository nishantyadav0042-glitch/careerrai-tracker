'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import ScreenBlueprintIntro from './screens/screen-blueprint-intro';
import ScreenDreamColleges from './screens/screen-dream-colleges';
import ScreenExamContext from './screens/screen-exam-context';
import ScreenAboutYou from './screens/screen-about-you';
import ScreenDailyCommitment from './screens/screen-daily-commitment';
import ScreenTopicCoverage from './screens/screen-topic-coverage';
import ScreenMeetBuddy from './screens/screen-meet-buddy';
import ScreenBuildAnimation from './screens/screen-build-animation';
import ScreenBlueprintReveal from './screens/screen-blueprint-reveal';
import ScreenBlueprintContract from './screens/screen-blueprint-contract';
import { BlueprintPanel } from './components/blueprint-panel';
import { BLUEPRINT_SECTIONS, computeBlueprintPreview, type SectionId } from '@/lib/blueprint-builder';

interface OnboardingModalProps {
  onComplete: () => void;
}

// This is the Blueprint Builder, not "onboarding" — the distinction isn't
// cosmetic. Every screen either feeds the planning engine directly or shows
// a real signal it's about to use; the 4 labeled sections below map 1:1 to
// routine-engine/topic-selector/mission-engine's actual inputs (see
// blueprint-builder.ts for the field-by-field trace). What used to be a
// flat "Screen 7/13" wizard is now framed as building something the student
// watches assemble, ending in a Blueprint reveal and a personal contract —
// not a form-submitted acknowledgment.
interface Screen {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: React.ComponentType<any>;
  sectionId: SectionId | null;
  extraProps?: Record<string, unknown>;
}

export function OnboardingModal({ onComplete }: OnboardingModalProps) {
  const supabase = createClient();
  const [currentScreen, setCurrentScreen] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [studyTargetHours, setStudyTargetHours] = useState<number>(2);
  const [weekendHours, setWeekendHours] = useState<number>(4);
  const [onboardingData, setOnboardingData] = useState<Record<string, unknown>>({});

  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
    }
    getUser();
  }, [supabase]);

  const preview = computeBlueprintPreview({
    attempt_year: onboardingData.attempt_year as number | undefined,
    is_repeater: onboardingData.is_repeater as boolean | undefined,
    is_working_professional: onboardingData.is_working_professional as boolean | undefined,
    course_year: onboardingData.course_year as number | undefined,
    weakest_section: onboardingData.weakest_section as string | undefined,
    weak_topic: onboardingData.weak_topic as string | undefined,
    studyTargetHours: onboardingData.studyTargetHours as number | undefined,
    weekendHours: onboardingData.weekendHours as number | undefined,
    coverage_practicing: onboardingData.coverage_practicing as number | undefined,
    coverage_learning: onboardingData.coverage_learning as number | undefined,
    coverage_total: onboardingData.coverage_total as number | undefined,
  });

  // No single-topic self-report screens (weakest section/topic, stage,
  // blocker, baseline percentiles) — the explicit per-topic Coverage grid
  // supersedes all of them, and the engines now derive those signals from
  // it (see /api/routine/today). One question never asks what a better
  // question already answered.
  const screens: Screen[] = [
    { component: ScreenBlueprintIntro, sectionId: null },        // 0
    { component: ScreenDreamColleges, sectionId: 'position' },   // 1
    { component: ScreenExamContext, sectionId: 'position' },     // 2
    { component: ScreenAboutYou, sectionId: 'position' },        // 3
    { component: ScreenDailyCommitment, sectionId: 'time' },     // 4
    { component: ScreenTopicCoverage, sectionId: 'coverage' },   // 5
    { component: ScreenMeetBuddy, sectionId: null },             // 6
    { component: ScreenBuildAnimation, sectionId: null },        // 7
    { component: ScreenBlueprintReveal, sectionId: null },       // 8
    {
      component: ScreenBlueprintContract,
      sectionId: null,
      extraProps: { archetypeLabel: preview.archetypeBadge, weeklyLoadHours: preview.weeklyLoadHours },
    }, // 9
  ];

  const currentScreenMeta = screens[currentScreen];
  const CurrentScreen = currentScreenMeta.component;
  const activeSection = currentScreenMeta.sectionId
    ? BLUEPRINT_SECTIONS.find((s) => s.id === currentScreenMeta.sectionId)
    : null;
  const isFirstOfSection =
    activeSection != null &&
    (currentScreen === 0 || screens[currentScreen - 1].sectionId !== currentScreenMeta.sectionId);
  const coverageSectionOrder = BLUEPRINT_SECTIONS.find((s) => s.id === 'coverage')!.order;
  // Section index for the panel's progress dots: while in a labeled section,
  // its own order; once past Coverage (buddy/build/reveal/contract), show
  // all sections as complete — there's nothing left for the panel to track.
  const panelSectionIndex = activeSection ? activeSection.order : coverageSectionOrder;

  const handleNext = async (data?: Record<string, unknown>) => {
    if (data) setOnboardingData((prev) => ({ ...prev, ...data }));
    setError(null);

    try {
      // Screen 1 = Dream Colleges
      if (currentScreen === 1 && data?.dream_colleges) {
        setIsLoading(true);
        const { error: e } = await supabase.from('profiles').update({ dream_colleges: data.dream_colleges }).eq('id', userId ?? '');
        if (e) throw e;
      }
      // Screen 2 = Exam Context
      if (currentScreen === 2 && data) {
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
      // Screen 3 = About You
      if (currentScreen === 3 && data) {
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
      // Screen 4 = Daily Commitment (weekday + weekend hours)
      if (currentScreen === 4 && data?.studyTargetHours) {
        const hours = data.studyTargetHours as number;
        const weekend = (data.weekendHours as number | undefined) ?? weekendHours;
        setStudyTargetHours(hours);
        setWeekendHours(weekend);
        setIsLoading(true);
        const { error: e } = await supabase.from('profiles').update({
          study_target_hours: hours,
          hours_available: hours,
          weekend_hours_available: weekend,
        }).eq('id', userId ?? '');
        if (e) throw e;
      }

      if (currentScreen < screens.length - 1) {
        setCurrentScreen(currentScreen + 1);
        setIsLoading(false);
      } else {
        // Last screen (Blueprint Contract) — persist everything the user
        // entered in one final awaited write. The per-screen saves above are
        // already awaited, but this is still the source of truth for the
        // profile fields, so a partial failure earlier can never leave
        // onboarding_completed=true with a half-filled profile.
        if (!userId) throw new Error('User ID not found');

        const merged: Record<string, unknown> = { ...onboardingData, ...(data ?? {}) };
        const update: Record<string, unknown> = {
          onboarding_completed: true,
          study_target_hours: studyTargetHours,
          weekend_hours_available: weekendHours,
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
        if (typeof merged.study_window === 'string') update.study_window = merged.study_window;

        const { error: finalError } = await supabase.from('profiles').update(update).eq('id', userId).select();
        if (finalError) throw finalError;

        onComplete();
      }
    } catch (err) {
      console.error('Blueprint Builder error:', err);
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
        <div className="bg-white border-b border-stone-200 p-6 pb-4">
          <h2 className="text-lg font-bold text-stone-900 mb-1" style={{ fontFamily: 'Georgia, serif' }}>
            Build Your CAT Blueprint
          </h2>
          {activeSection && isFirstOfSection && (
            <p className="text-sm text-orange-600 font-semibold">{activeSection.eyebrow}</p>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <p>{error}</p>
            </div>
          )}

          {currentScreenMeta.sectionId && <BlueprintPanel preview={preview} sectionIndex={panelSectionIndex} coverageSectionIndex={coverageSectionOrder} totalSections={BLUEPRINT_SECTIONS.length} />}

          <CurrentScreen
            onNext={handleNext}
            onBack={handleBack}
            canGoBack={currentScreen > 0}
            isLoading={isLoading}
            {...(currentScreenMeta.extraProps ?? {})}
          />
        </div>
      </div>
    </div>
  );
}
