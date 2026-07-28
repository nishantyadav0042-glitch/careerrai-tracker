'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import ScreenNeedCheck from './screens/screen-need-check';
import ScreenAmbitionDate from './screens/screen-ambition-date';
import ScreenDreamColleges from './screens/screen-dream-colleges';
import ScreenExamContext from './screens/screen-exam-context';
import ScreenAboutYou from './screens/screen-about-you';
import ScreenRealityCheck from './screens/screen-reality-check';
import ScreenFinishDate from './screens/screen-finish-date';
import ScreenTopicCoverage from './screens/screen-topic-coverage';
import ScreenRepeaterBuddyPitch from './screens/screen-repeater-buddy-pitch';
import ScreenCoachingPlan from './screens/screen-coaching-plan';
import ScreenMeetBuddy from './screens/screen-meet-buddy';
import ScreenPathChoice from './screens/screen-path-choice';
import ScreenBuildAnimation from './screens/screen-build-animation';
import ScreenBlueprintReveal from './screens/screen-blueprint-reveal';
import { BlueprintPanel } from './components/blueprint-panel';
import { BLUEPRINT_SECTIONS, computeBlueprintPreview, type SectionId } from '@/lib/blueprint-builder';

interface OnboardingModalProps {
  onComplete: () => void;
}

// Every screen from 1-4 already persists straight to `profiles` as it's
// answered, but the step position itself and the later screens' answers
// (success_goal, study_windows — only written to DB on the very last screen)
// lived in plain useState. Closing the tab or losing connection mid-flow
// reset to screen 0 with nothing prefilled, forcing a full re-answer. Keyed
// by userId (not a fixed key) so a shared device can't leak one student's
// in-progress answers into a different account's onboarding.
interface OnboardingDraft {
  currentScreen: number;
  onboardingData: Record<string, unknown>;
  studyTargetHours: number;
  weekendHours: number;
}

function draftKey(userId: string): string {
  // Version-bumped whenever the screen ORDER changes — an old draft's
  // currentScreen index would otherwise resume on the wrong screen.
  // v2: finish-date chooser replaced Daily Commitment.
  // v3: success-goal + contract screens removed.
  // v4: opening funnel added (need-check → ambition date → permission).
  // v5: notification-permission screen removed — reminders are only asked for
  //     inside the installed app now, never before install/signup.
  // v6: reality-check gut-check screen inserted before the coverage grid.
  // v7: two-paths (loss-aversion) screen inserted before the build animation.
  // v8: real WhatsApp testimonial screenshot inserted after Meet-Buddy.
  // v9: repeater-only buddy pitch inserted after the commitment screen, and
  //     screens are now identified by a stable `key`, not raw index.
  return `cr_onboarding_draft_v9_${userId}`;
}

function loadOnboardingDraft(userId: string): OnboardingDraft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.currentScreen !== 'number' || typeof parsed?.onboardingData !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
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
  // Stable identity for header copy / progress counting — NOT the array
  // index, so a conditionally-inserted screen (the repeater pitch) can never
  // shift another screen's header line or "X left" count out from under it.
  key: string;
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
  // From the /start funnel, stored on profiles — not an onboarding answer.
  const [coachingEnrolled, setCoachingEnrolled] = useState<boolean | null>(null);
  const [studyTargetHours, setStudyTargetHours] = useState<number>(2);
  const [weekendHours, setWeekendHours] = useState<number>(4);
  const [onboardingData, setOnboardingData] = useState<Record<string, unknown>>({});

  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data: prof } = await supabase
        .from('profiles').select('coaching_enrolled').eq('id', user.id).maybeSingle();
      setCoachingEnrolled((prof?.coaching_enrolled as boolean | null) ?? null);
      const draft = loadOnboardingDraft(user.id);
      if (draft) {
        setCurrentScreen(draft.currentScreen);
        setOnboardingData(draft.onboardingData);
        setStudyTargetHours(draft.studyTargetHours);
        setWeekendHours(draft.weekendHours);
      }
    }
    getUser();
  }, [supabase]);

  // Mirror progress to localStorage on every change so a reload resumes
  // instead of restarting. Skipped until userId is known so a draft is
  // never written under the wrong key, and skipped on screen 0 (nothing to
  // resume yet, and avoids overwriting a real draft while it's still loading).
  useEffect(() => {
    if (!userId || currentScreen === 0) return;
    try {
      window.localStorage.setItem(
        draftKey(userId),
        JSON.stringify({ currentScreen, onboardingData, studyTargetHours, weekendHours })
      );
    } catch {
      // Private browsing / storage full — best-effort only, not launch-critical.
    }
  }, [userId, currentScreen, onboardingData, studyTargetHours, weekendHours]);

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
  const isRepeaterFlow = onboardingData.is_repeater === true;

  const screens: Screen[] = [
    // Opening funnel (founder design): commitment question → owned date, THEN
    // we start asking. Notification permission is NOT asked here — reminders
    // are requested only inside the installed app (installing is job #1), so a
    // pre-install permission ask (dead on iPhone) was removed.
    { key: 'need-check', component: ScreenNeedCheck, sectionId: null },
    { key: 'ambition-date', component: ScreenAmbitionDate, sectionId: null },
    { key: 'dream-colleges', component: ScreenDreamColleges, sectionId: 'position' },
    { key: 'exam-context', component: ScreenExamContext, sectionId: 'position' },
    { key: 'about-you', component: ScreenAboutYou, sectionId: 'position' },
    // Reality-check (founder): the gut-check that makes the coverage grid feel
    // like a relief instead of a chore. sectionId null — a pattern-interrupt,
    // not a plan input.
    { key: 'reality-check', component: ScreenRealityCheck, sectionId: null },
    {
      key: 'topic-coverage',
      component: ScreenTopicCoverage,
      sectionId: 'coverage',
      // Draft key scoped to the logged-in student (bug audit, 14 July) — the
      // component's own default is a global pre-auth key; without this a
      // shared device could resume a DIFFERENT student's half-finished
      // coverage taps into this account. userId is known by the time this
      // screen is reachable — screen 0 already needs a session.
      extraProps: { draftKey: userId ? `cr_onboarding_topic_coverage_draft_v3_${userId}` : undefined },
    },
    {
      // The finish-date chooser (replaces the old Daily Commitment screen):
      // hours + target date picked together, AFTER coverage so the date
      // options are priced from the topics the student just declared. This
      // is "the commitment" the repeater pitch below references.
      key: 'finish-date',
      component: ScreenFinishDate,
      sectionId: 'time',
      extraProps: {
        coveragePracticing: (onboardingData.coverage_practicing as number | undefined) ?? null,
        coverageLearning: (onboardingData.coverage_learning as number | undefined) ?? null,
        coverageTotal: (onboardingData.coverage_total as number | undefined) ?? null,
        attemptYear: (onboardingData.attempt_year as number | undefined) ?? null,
        ambitionDate: (onboardingData.ambition_date as string | undefined) ?? null,
      },
    },
    // Coaching-only (founder: "who says no, don't give them the option").
    // Placed right after the finish-date commitment, because that's the moment
    // the plan's ORDER is being decided — a coaching student who is already
    // following an imposed syllabus needs to say so before we build around a
    // different order. Self-study students never see this screen at all.
    ...(coachingEnrolled === true
      ? [{ key: 'coaching-plan', component: ScreenCoachingPlan, sectionId: 'time' } satisfies Screen]
      : []),
    // Repeater-only (founder, 23 Jul): right after the commitment, before
    // Meet-Buddy — "don't worry, IIM buddy at ₹999" + a thank-you, using the
    // last-year percentile + buddy-history answers from exam-context.
    ...(isRepeaterFlow
      ? [{
          key: 'repeater-buddy-pitch',
          component: ScreenRepeaterBuddyPitch,
          sectionId: null,
          extraProps: {
            lastYearPercentile: (onboardingData.last_year_percentile as number | undefined) ?? null,
            hadBuddyLastYear: (onboardingData.had_buddy_last_year as boolean | undefined) ?? null,
          },
        } satisfies Screen]
      : []),
    { key: 'meet-buddy', component: ScreenMeetBuddy, sectionId: null },
    // Loss-aversion beat (founder): the two futures, right before the plan
    // builds — fear landing at the emotional crescendo.
    { key: 'path-choice', component: ScreenPathChoice, sectionId: null },
    { key: 'build-animation', component: ScreenBuildAnimation, sectionId: null },
    {
      // Last screen (founder cut: the success-goal question duplicated the
      // percentile ask, and the contract/oath screen was one tap too many —
      // super quick beats ceremonial). The Reveal's "Start my prep →"
      // already sends onboardingCompleted and fires the final save.
      key: 'blueprint-reveal',
      component: ScreenBlueprintReveal,
      sectionId: null,
      extraProps: { successGoal: null },
    },
  ];

  const currentScreenMeta = screens[currentScreen];
  const CurrentScreen = currentScreenMeta.component;
  const activeSection = currentScreenMeta.sectionId
    ? BLUEPRINT_SECTIONS.find((s) => s.id === currentScreenMeta.sectionId)
    : null;
  const coverageSectionOrder = BLUEPRINT_SECTIONS.find((s) => s.id === 'coverage')!.order;

  // Header = ONE targeted line + the count (founder decision, v2: shorter
  // and personal). It speaks with the student's own accumulating answers —
  // their dream college, their name, their real hours — so every screen
  // proves the previous answer mattered. Loss-aversion, never cheerleading,
  // no invented statistics; every personalized fact is something they just
  // typed. Fallbacks cover the screens before that data exists.
  // Counted, in-order keys for the "X left" progress label — deliberately
  // NOT including the conditional repeater-pitch screen (it's a bonus beat,
  // not one of the core asks), so inserting it never perturbs this count.
  const COUNTED_KEYS = ['ambition-date', 'dream-colleges', 'exam-context', 'about-you', 'reality-check', 'topic-coverage', 'finish-date'];
  const countedPos = COUNTED_KEYS.indexOf(currentScreenMeta.key);
  const asksLeft = countedPos === -1 ? null : COUNTED_KEYS.length - countedPos;
  const leftLabel = asksLeft == null ? null : asksLeft === 1 ? 'Last section' : `${asksLeft} left`;
  const hFirstName = typeof onboardingData.full_name === 'string' && onboardingData.full_name.trim()
    ? onboardingData.full_name.trim().split(' ')[0] : null;
  const hFirstDream = Array.isArray(onboardingData.dream_colleges)
    ? ((onboardingData.dream_colleges as string[])[0] ?? null) : null;
  const hAttemptYear = typeof onboardingData.attempt_year === 'number' ? onboardingData.attempt_year : null;
  const headerLine = (() => {
    switch (currentScreenMeta.key) {
      case 'ambition-date': return 'Your date. Your call.';
      case 'dream-colleges': return 'Every answer changes what you study tomorrow.';
      case 'exam-context': return hFirstDream ? `${hFirstDream} is the target. Set your pace.` : 'Your attempt year sets the pace of the plan.';
      case 'about-you': return hAttemptYear ? `CAT ${hAttemptYear}. Now make the plan yours.` : 'The more honest, the better the plan.';
      case 'reality-check': return 'A 30-second gut check.';
      case 'topic-coverage': return hFirstName ? `${hFirstName}, we'll skip what you've already finished.` : "We'll skip what you've already finished.";
      case 'finish-date': return hFirstName ? `${hFirstName}, lock your date with the real math.` : 'Lock your date with the real math.';
      case 'repeater-buddy-pitch': return 'One more thing, before we go on.';
      case 'meet-buddy': return preview.weeklyLoadHours != null ? `Your ${preview.weeklyLoadHours}h/week plan is nearly built.` : 'Nearly built.';
      case 'path-choice': return 'Two ways this year can go.';
      case 'build-animation': return hFirstName ? `Building ${hFirstName}'s CAT plan…` : 'Building your CAT plan…';
      default: return null;
    }
  })();
  // Section index for the panel's progress dots: while in a labeled section,
  // its own order; once past Coverage (buddy/build/reveal/contract), show
  // all sections as complete — there's nothing left for the panel to track.
  const panelSectionIndex = activeSection ? activeSection.order : coverageSectionOrder;

  const handleNext = async (data?: Record<string, unknown>) => {
    if (data) setOnboardingData((prev) => ({ ...prev, ...data }));
    setError(null);

    // Drop marker for the leads system — records how far every student got,
    // so the admin can see "dropped at Exam Context" for anyone who never
    // finishes. Fire-and-forget: lead telemetry must never slow down or
    // block the student's own flow.
    if (userId) {
      const reached = currentScreen + 1;
      // onboarding_last_activity_at anchors the builder-recovery ladder
      // (30min/24h/72h touches are timed from the last screen advance).
      void supabase.from('profiles')
        .update({ onboarding_step_reached: reached, onboarding_last_activity_at: new Date().toISOString() })
        .eq('id', userId)
        .lt('onboarding_step_reached', reached)
        .then(({ error: e }) => { if (e) console.error('step marker failed:', e.message); });
    }

    try {
      // Per-screen saves are keyed by DATA SHAPE, not screen index. A screen
      // reorder once left these on stale indices, so advancing from Dreams
      // fired the About-You write and set full_name = null → a not-null
      // constraint crash. Shape-keying makes that impossible: each save runs
      // only when its own distinctive fields are present.

      // Dream Colleges
      if (data?.dream_colleges) {
        setIsLoading(true);
        const { error: e } = await supabase.from('profiles').update({ dream_colleges: data.dream_colleges }).eq('id', userId ?? '');
        if (e) throw e;
      }
      // Exam Context (+ the repeater-only follow-up questions, same screen/shape)
      if (data && (data.exam_target !== undefined || data.attempt_year !== undefined || data.target_percentile !== undefined || data.category !== undefined || data.is_repeater !== undefined)) {
        setIsLoading(true);
        const ec: Record<string, unknown> = {};
        if (data.is_repeater !== undefined) ec.is_repeater = data.is_repeater;
        if (data.category !== undefined) ec.category = data.category ?? null;
        if (data.exam_target !== undefined) ec.exam_target = data.exam_target ?? null;
        if (data.attempt_year !== undefined) ec.attempt_year = data.attempt_year ?? null;
        if (data.target_percentile !== undefined) ec.target_percentile = data.target_percentile ?? null;
        if (data.last_year_percentile !== undefined) ec.last_year_percentile = data.last_year_percentile ?? null;
        if (data.had_buddy_last_year !== undefined) ec.had_buddy_last_year = data.had_buddy_last_year ?? null;
        const { error: e } = await supabase.from('profiles').update(ec).eq('id', userId ?? '');
        if (e) throw e;
      }
      // About You — full_name and phone are NEVER nulled (required / identity
      // fields already set at signup); they update only when a real value is typed.
      if (data && (data.full_name !== undefined || data.phone !== undefined || data.college !== undefined || data.course_year !== undefined || data.is_working_professional !== undefined || data.work_ex_months !== undefined || data.coaching_enrolled !== undefined)) {
        setIsLoading(true);
        const ay: Record<string, unknown> = {};
        if (typeof data.full_name === 'string' && data.full_name.trim()) ay.full_name = data.full_name.trim();
        if (typeof data.phone === 'string' && data.phone.trim()) ay.phone = data.phone.trim();
        if (data.college !== undefined) ay.college = data.college || null;
        if (data.course_year !== undefined) ay.course_year = data.course_year ?? null;
        if (data.is_working_professional !== undefined) ay.is_working_professional = data.is_working_professional ?? false;
        if (data.work_ex_months !== undefined) ay.work_ex_months = data.work_ex_months ?? null;
        if (data.coaching_enrolled !== undefined) ay.coaching_enrolled = data.coaching_enrolled ?? false;
        if (Object.keys(ay).length > 0) {
          const { error: e } = await supabase.from('profiles').update(ay).eq('id', userId ?? '');
          if (e) throw e;
        }
      }
      // Finish-date chooser — hours + owned target date land together
      // (keyed by the data shape, not the screen index, so a reorder can't
      // silently break the save).
      if (data?.syllabus_target_date && data?.studyTargetHours) {
        const hours = data.studyTargetHours as number;
        const weekend = (data.weekendHours as number | undefined) ?? hours;
        setStudyTargetHours(hours);
        setWeekendHours(weekend);
        setIsLoading(true);
        const { error: e } = await supabase.from('profiles').update({
          study_target_hours: hours,
          hours_available: hours,
          weekend_hours_available: weekend,
          syllabus_target_date: data.syllabus_target_date,
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
          // Completion re-anchors: from here this timestamp drives the
          // activation ladder (days 0/1/3/7 of "your routine is waiting").
          onboarding_last_activity_at: new Date().toISOString(),
          study_target_hours: studyTargetHours,
          weekend_hours_available: weekendHours,
        };
        if (merged.syllabus_target_date) update.syllabus_target_date = merged.syllabus_target_date;
        if (typeof merged.full_name === 'string' && merged.full_name.trim()) update.full_name = merged.full_name.trim();
        if (merged.college) update.college = merged.college;
        if (merged.dream_colleges) update.dream_colleges = merged.dream_colleges;
        if (merged.target_percentile != null) update.target_percentile = merged.target_percentile;
        if (merged.attempt_year != null) update.attempt_year = merged.attempt_year;
        if (merged.is_repeater != null) update.is_repeater = merged.is_repeater;
        if (merged.last_year_percentile != null) update.last_year_percentile = merged.last_year_percentile;
        if (typeof merged.had_buddy_last_year === 'boolean') update.had_buddy_last_year = merged.had_buddy_last_year;
        if (merged.category != null) update.category = merged.category;
        if (typeof merged.is_working_professional === 'boolean') update.is_working_professional = merged.is_working_professional;
        if (merged.work_ex_months != null) update.work_ex_months = merged.work_ex_months;
        if (typeof merged.coaching_enrolled === 'boolean') update.coaching_enrolled = merged.coaching_enrolled;
        if (merged.course_year != null) update.course_year = merged.course_year;
        if (typeof merged.study_window === 'string') update.study_window = merged.study_window;
        if (Array.isArray(merged.study_windows) && merged.study_windows.length > 0) update.study_windows = merged.study_windows;
        if (typeof merged.success_goal === 'string') update.success_goal = merged.success_goal;

        const { error: finalError } = await supabase.from('profiles').update(update).eq('id', userId).select();
        if (finalError) throw finalError;

        try { window.localStorage.removeItem(draftKey(userId)); } catch { /* best-effort */ }
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
        {/* Header — one personalized line + the count. Title only on intro;
            the dark panel below already carries the "My CAT Plan" identity. */}
        <div className="bg-white border-b border-stone-200 px-6 py-4">
          {currentScreen === 0 ? (
            <>
              <h2 className="text-lg font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
                Build My CAT Plan
              </h2>
              <p className="text-xs text-stone-500 mt-1">This takes about 4 minutes.</p>
            </>
          ) : (
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 truncate text-sm font-semibold text-stone-900">
                {headerLine ?? 'Build My CAT Plan'}
              </p>
              {leftLabel && <p className="shrink-0 text-xs font-bold text-orange-600">{leftLabel}</p>}
            </div>
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
