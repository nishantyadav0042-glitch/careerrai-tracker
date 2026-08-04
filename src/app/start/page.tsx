'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Logo } from '@/components/logo';
import ScreenNeedCheck from './screens/screen-need-check';
import ScreenTargetDate from './screens/screen-target-date';
import ScreenDreamPercentile from './screens/screen-dream-percentile';
import ScreenQuickFacts from './screens/screen-quick-facts';
import ScreenPainPoints from './screens/screen-pain-points';
import ScreenRealityCheck from '@/app/student/onboarding/screens/screen-reality-check';
import ScreenTopicCoverage from '@/app/student/onboarding/screens/screen-topic-coverage';
import ScreenInstantInsight from './screens/screen-instant-insight';
import ScreenMentor from './screens/screen-mentor';
import ScreenLoginBuild from './screens/screen-login-build';
import type { CoverageSectionId } from '@/lib/topics-constants';
import { VERBAL_TOPICS, LRDI_TOPICS, QUANT_TOPICS, MOCK_PREP_UNITS, READING_HABIT_UNITS } from '@/lib/topics-constants';
import { trackFunnel } from '@/lib/funnel';
import { START_STEP_KEYS } from '@/lib/funnel-steps';

// ── Buddy demo mode (?demo=1) ───────────────────────────────────────────────
// Buddies walk the REAL student journey A to Z without filling anything:
// every screen gets a guide card explaining what the student does there, and
// one tap auto-continues with "Aarav's" answers (the same persona as the
// buddydemo account). Nothing is saved — no funnel beacons (they'd poison
// the growth dashboard), no draft persistence, and the final screen closes
// the loop instead of creating an account. Inert unless ?demo=1 is present.
// The flag is read via useSearchParams (never window.location during render):
// the server sees the same query on a dynamic render, so the demo UI can't
// cause a hydration mismatch.

type DemoMatrix = { section: string; topic: string; status: 'not_started' | 'learning' | 'practicing' | 'revising' }[];
function demoMatrix(): DemoMatrix {
  const all: { section: string; topic: string }[] = [
    ...VERBAL_TOPICS.map((t) => ({ section: 'VARC', topic: t })),
    ...LRDI_TOPICS.map((t) => ({ section: 'DILR', topic: t })),
    ...QUANT_TOPICS.map((t) => ({ section: 'QA', topic: t })),
    ...MOCK_PREP_UNITS.map((t) => ({ section: 'MOCKS', topic: t })),
    ...READING_HABIT_UNITS.map((t) => ({ section: 'READING', topic: t })),
  ];
  const statuses = ['revising', 'practicing', 'learning', 'not_started'] as const;
  return all.map((x, i) => ({ ...x, status: statuses[Math.floor((i / all.length) * 4)] }));
}

// What the student does on each screen + the answer Aarav gives. The patch
// mirrors what the real screen's onNext would send, so downstream screens
// (quick-facts reads the date; instant-insight reads the matrix) behave
// exactly as they do for a real student.
const DEMO_STEPS: Record<string, { what: string; answer: string; patch: Record<string, unknown> }> = {
  'need-check': {
    what: 'The opener — the student names their situation, and the journey speaks to it from here on.',
    answer: 'Aarav: "I have a plan but I keep falling behind."',
    patch: { need_check: 'falling_behind' },
  },
  'target-date': {
    what: 'The student picks THEIR syllabus-finish date. Founder rule: you decide the date, you own the plan.',
    answer: 'Aarav picks: 30 September (mock season from October).',
    patch: { ambition_date: '2026-09-30' },
  },
  'dream-percentile': {
    what: 'The ambition question. Everything after this is denominated in the student\'s own target.',
    answer: 'Aarav: 99 percentile — IIM Ahmedabad.',
    patch: { target_percentile: 99, dream_colleges: ['IIM Ahmedabad', 'IIM Bangalore'] },
  },
  'quick-facts': {
    what: 'The facts the plan adapts to: attempt number, coaching, hours available per day.',
    answer: 'Aarav: first attempt · has coaching · 4 hrs/day.',
    patch: { is_repeater: false, coaching_enrolled: true, hours_available: 4 },
  },
  'pain-points': {
    what: 'What has been going wrong so far — this feeds the first diagnosis and the sales brief.',
    answer: 'Aarav: "no structure" + "mock scores stuck".',
    patch: { pain_points: ['no_structure', 'mock_plateau'] },
  },
  'reality-check': {
    what: 'Three honest calibration questions — separates confidence from wishful thinking.',
    answer: 'Aarav answers honestly (mid confidence).',
    patch: { reality_check: 'done' },
  },
  'topic-coverage': {
    what: 'The heart of onboarding: all 53 CAT topics, one tap each — "where do you actually stand?" This map becomes the student\'s permanent prep memory.',
    answer: 'Aarav\'s 53-topic map auto-fills (a real mid-journey spread).',
    patch: { topic_matrix: [] }, // filled at click time — demoMatrix() is not needed until then
  },
  'instant-insight': {
    what: 'The WOW moment: an instant diagnosis computed from the map they tapped 10 seconds ago — real value BEFORE any signup. This screen is the pitch.',
    answer: 'Read it — this is Aarav\'s actual diagnosis.',
    patch: {},
  },
  mentor: {
    what: 'The mentor question — where buddy demand is captured. Students who tap yes here are your future mentees.',
    answer: 'Aarav: "Yes, I want an IIM mentor."',
    patch: { wants_mentor: true },
  },
};

// Screen order as stable KEYS, not raw index. login-build is deliberately
// excluded (it's the default/final screen, reached once stepIdx >= stepKeys.length).
//
// The repeater ₹999 buddy PITCH screen deliberately does NOT live here
// (founder, 23 Jul): a sales pitch mid pre-auth signup adds friction to the
// core funnel before an account even exists. It lives only in-app, right
// after the commitment (finish-date) screen in onboarding-modal.tsx. This
// pre-auth funnel still asks the two repeater QUESTIONS below (last year's
// percentile, had-a-buddy) — that data alone is real sales value (feeds the
// Expedify call brief), no extra screen required.
// Screen order lives in lib/funnel-steps so the beacon route accepts exactly
// what this file fires. They were separate lists once; see that file.
const BASE_STEP_KEYS: readonly string[] = START_STEP_KEYS;

function stepKeysFor(): readonly string[] {
  return BASE_STEP_KEYS;
}

// Founder-directed rebuild: every onboarding question now happens BEFORE
// the account exists — "you decide the date, you own the plan" comes first,
// signup comes last as "log in while we build." Nothing here writes to
// Supabase until ScreenLoginBuild's verify call, which hands the whole
// accumulated payload over in one request.
// v2: bumping the key invalidates every draft saved before clear-on-signup existed.
// v3: reality-check (3 questions) + social-proof (testimonial) screens added.
// v4: removed the standalone reassurance screen (redundant with reality-check).
// v5: Instant Insight screen inserted after topic-coverage (founder: WOW value
//     before signup — the diagnosis IS the pitch for daily insights + install).
// v6: repeater-only buddy pitch inserted after quick-facts — REVERTED in v7,
//     see note above stepKeysFor.
// v7: repeater buddy pitch removed from this funnel (stays in-app only).
const DRAFT_KEY = 'cr_preauth_draft_v7';
// A draft older than this is an abandoned lead, not a session to resume —
// dropping them prevents a week-old half-journey from resurrecting.
const DRAFT_TTL_MS = 72 * 60 * 60 * 1000;

const TOPIC_SECTION_ORDER: CoverageSectionId[] = ['DILR', 'VARC', 'QA', 'MOCKS', 'READING'];
const TOPIC_SECTION_INTRO: Partial<Record<CoverageSectionId, string>> = {
  DILR: 'Set selection wins DILR — let\'s see where you stand.',
  VARC: 'Reading habits move VARC more than any drill.',
  QA: 'The last core section — then it\'s just revision and mocks.',
  MOCKS: 'Almost done — revision and mock readiness, one honest tap each.',
};

function loadDraft(): { stepIdx: number; data: Record<string, unknown> } | null {
  if (typeof window === 'undefined') return null;
  try {
    // Old-version drafts are dead weight — clear them so they can never
    // resume a journey again on this device.
    window.localStorage.removeItem('cr_preauth_draft_v1');
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.stepIdx !== 'number' || typeof parsed?.data !== 'object') return null;
    if (typeof parsed?.savedAt !== 'number' || Date.now() - parsed.savedAt > DRAFT_TTL_MS) {
      window.localStorage.removeItem(DRAFT_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export default function StartPage() {
  // useSearchParams requires a Suspense boundary at the page root.
  return (
    <Suspense fallback={null}>
      <StartPageInner />
    </Suspense>
  );
}

function StartPageInner() {
  const demo = useSearchParams().get('demo') != null;
  const draft = demo ? null : loadDraft();
  const initialData = draft?.data ?? {};
  const [stepIdx, setStepIdx] = useState(() => (demo ? 0 : Math.min(draft?.stepIdx ?? 0, stepKeysFor().length - 1)));
  const [data, setData] = useState<Record<string, unknown>>(initialData);

  // Recomputed live every render — reflects is_repeater the moment quick-facts
  // sets it, exactly like the post-login onboarding modal's key-based screens.
  const stepKeys = stepKeysFor();
  const TOTAL_SCREENS = stepKeys.length; // excludes the final login/build screen from the progress bar
  const currentKey = stepIdx < stepKeys.length ? stepKeys[stepIdx] : 'login-build';

  useEffect(() => {
    if (demo) return; // a buddy's walkthrough must never become a resumable student draft
    try { window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ stepIdx, data, savedAt: Date.now() })); } catch { /* best-effort */ }
  }, [stepIdx, data, demo]);

  // Funnel beacon: record which onboarding screen this visitor reached.
  // Demo walkthroughs are excluded — buddies touring the funnel would inflate
  // every stage of the growth dashboard.
  useEffect(() => {
    if (demo) return;
    trackFunnel(`start:${currentKey}`);
  }, [currentKey, demo]);

  const advance = (patch?: Record<string, unknown>) => {
    if (patch) setData((prev) => ({ ...prev, ...patch }));
    setStepIdx((i) => Math.min(i + 1, TOTAL_SCREENS));
  };
  const back = () => setStepIdx((i) => Math.max(i - 1, 0));
  // Wipe the saved draft and restart at screen 1. Prevents a device that
  // already ran the funnel (an abandoned lead, a finished signup, a shared
  // phone) from silently resuming someone else's half-finished journey.
  const startOver = () => {
    try {
      window.localStorage.removeItem(DRAFT_KEY);
      window.localStorage.removeItem('cr_onboarding_topic_coverage_draft');
    } catch { /* best-effort */ }
    setData({});
    setStepIdx(0);
  };

  const shared = { onBack: back, canGoBack: stepIdx > 0, isLoading: false };

  let content: React.ReactNode;
  switch (currentKey) {
    case 'need-check':
      content = <ScreenNeedCheck onNext={advance} isLoading={false} />;
      break;
    case 'target-date':
      content = <ScreenTargetDate onNext={advance} {...shared} />;
      break;
    case 'dream-percentile':
      content = <ScreenDreamPercentile onNext={advance} {...shared} />;
      break;
    case 'quick-facts':
      content = <ScreenQuickFacts onNext={advance} ambitionDate={data.ambition_date as string | undefined} {...shared} />;
      break;
    case 'pain-points':
      content = <ScreenPainPoints onNext={advance} {...shared} />;
      break;
    case 'reality-check':
      content = <ScreenRealityCheck onNext={advance} {...shared} />;
      break;
    case 'topic-coverage':
      content = (
        <ScreenTopicCoverage
          onNext={advance}
          {...shared}
          deferSave
          sectionOrder={TOPIC_SECTION_ORDER}
          sectionIntro={TOPIC_SECTION_INTRO}
          onMatrixReady={(matrix) => setData((prev) => ({ ...prev, topic_matrix: matrix }))}
        />
      );
      break;
    case 'instant-insight':
      // Instant Insight (founder, 21 July): the WOW diagnosis from the matrix
      // they tapped 10 seconds ago — instant value BEFORE signup, and the
      // living demo of the daily-insight system they're joining.
      content = (
        <ScreenInstantInsight
          onNext={advance}
          {...shared}
          matrix={(data.topic_matrix as { section: string; topic: string; status: 'not_started' | 'learning' | 'practicing' | 'revising' }[] | undefined) ?? null}
          isRepeater={data.is_repeater === true}
          targetPercentile={(data.target_percentile as number | undefined) ?? null}
        />
      );
      break;
    case 'mentor':
      content = <ScreenMentor onNext={advance} {...shared} />;
      break;
    default:
      content = demo ? (
        // Demo journeys end with a summary, never an account. This screen is
        // where a real student signs up "while we build your plan".
        <div className="rounded-2xl border border-stone-200 bg-stone-50 p-5 text-center">
          <p className="text-3xl">🎓</p>
          <h2 className="mt-2 text-lg font-bold text-stone-900">That&apos;s the full journey — A to Z</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-stone-600">
            A real student signs up right here — phone OTP or password — and lands on their tracker with the plan
            you just watched them build: their date, their target, their hours, their 53-topic map. Everything the
            app does daily (plan, log, streaks, insights, your buddy tab) runs on what was captured in these screens.
          </p>
          <p className="mt-2 text-[12px] text-stone-500">
            Nothing you tapped was saved. Log in as <b>buddydemo@careerrai.in</b> to see where the student lands.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <button type="button" onClick={startOver} className="rounded-xl border border-stone-300 px-4 py-2 text-[13px] font-semibold text-stone-700">
              Replay journey
            </button>
            <Link href="/login" className="rounded-xl bg-stone-900 px-4 py-2 text-[13px] font-bold text-white">
              Open demo student →
            </Link>
          </div>
        </div>
      ) : (
        <ScreenLoginBuild isLoading={false} onboarding={data} />
      );
  }

  const demoStep = demo ? DEMO_STEPS[currentKey] : undefined;

  const showProgress = stepIdx < TOTAL_SCREENS;

  return (
    <div className="min-h-screen bg-white px-4 pt-4 pb-6">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-3 flex items-center justify-between">
          <Logo size="sm" />
          <div className="flex items-center gap-3">
            {stepIdx > 0 && (
              <button
                type="button"
                onClick={startOver}
                className="text-[11px] font-medium text-stone-400 underline underline-offset-2 hover:text-stone-600"
              >
                Start over
              </button>
            )}
            {showProgress && <p className="text-[11px] font-medium text-stone-400">{stepIdx + 1} / {TOTAL_SCREENS}</p>}
            {/* LOGIN, ON EVERY SCREEN, AND NEVER FINE PRINT.
                This is a store-review requirement, not decoration. The store
                wrappers now launch a logged-out student into this funnel, so
                for anyone with an account — including an App Review tester
                holding demo credentials — this link is the ONLY way in. Before
                it existed, login lived on screen 10, behind nine questions.
                An unreachable login is precisely what got the app rejected
                under Guideline 2.1 (Incident #10), and login/page.tsx carries
                the same warning about not demoting it to fine print.
                Bordered and stone-700 so it reads as a control, not a caption. */}
            <Link
              href="/login"
              prefetch={false}
              className="rounded-lg border border-stone-300 px-2.5 py-1 text-[11px] font-semibold text-stone-700 transition-colors hover:border-stone-900 hover:text-stone-900"
            >
              Log in
            </Link>
          </div>
        </div>
        {showProgress && (
          <div className="mb-4 h-1 w-full overflow-hidden rounded-full bg-stone-100">
            <div className="h-full rounded-full bg-stone-900 transition-all duration-300" style={{ width: `${((stepIdx + 1) / TOTAL_SCREENS) * 100}%` }} />
          </div>
        )}
        {/* A SECOND, UNMISSABLE LOGIN DOOR, on the first screen only.
            The header link is small by design; this one is for the person who
            must not miss it. Anyone who already has an account and lands at the
            top of this funnel — including a store reviewer holding demo
            credentials — should not have to hunt, because the way FORWARD ends
            at an SMS OTP to an Indian mobile that they cannot receive. That
            dead end is what rejected us once (Incident #10). Shown only at
            stepIdx 0 so it never interrupts a student mid-funnel. */}
        {stepIdx === 0 && (
          <Link
            href="/login"
            prefetch={false}
            className="mb-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-stone-300 bg-stone-50 px-4 py-2.5 text-[13px] font-semibold text-stone-700 transition-colors hover:border-stone-900 hover:text-stone-900"
          >
            Already have an account? <span className="underline underline-offset-2">Log in</span>
          </Link>
        )}
        {demo && (
          <div className="mb-3 rounded-lg bg-stone-900 px-3 py-1.5 text-center text-[11px] font-semibold text-white">
            🎓 Buddy demo — the student journey, nothing is saved
          </div>
        )}
        {content}
        {/* The per-screen guide: what the student does here + one tap to
            continue with Aarav's answer. The real screen above stays fully
            interactive so buddies can FEEL it — but they never have to. */}
        {demoStep && (
          <div className="fixed inset-x-0 bottom-0 z-[90] border-t-2 border-orange-500 bg-white p-3 shadow-[0_-8px_24px_rgba(0,0,0,0.12)]">
            <div className="mx-auto max-w-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-orange-600">What happens on this screen</p>
              <p className="mt-0.5 text-[12.5px] leading-snug text-stone-700">{demoStep.what}</p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="min-w-0 flex-1 text-[11.5px] font-semibold text-stone-500">{demoStep.answer}</p>
                <button
                  type="button"
                  onClick={() => {
                    const patch = currentKey === 'topic-coverage' ? { topic_matrix: demoMatrix() } : demoStep.patch;
                    advance(patch);
                  }}
                  className="shrink-0 rounded-xl bg-stone-900 px-3.5 py-2 text-[12px] font-bold text-white"
                >
                  Auto-fill & continue →
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
