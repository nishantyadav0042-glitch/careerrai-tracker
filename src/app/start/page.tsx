'use client';

import { useEffect, useState } from 'react';
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
import { trackFunnel } from '@/lib/funnel';

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
const BASE_STEP_KEYS = ['need-check', 'target-date', 'dream-percentile', 'quick-facts', 'pain-points', 'reality-check', 'topic-coverage', 'instant-insight', 'mentor'];

function stepKeysFor(): string[] {
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
  const draft = loadDraft();
  const initialData = draft?.data ?? {};
  const [stepIdx, setStepIdx] = useState(() => Math.min(draft?.stepIdx ?? 0, stepKeysFor().length - 1));
  const [data, setData] = useState<Record<string, unknown>>(initialData);

  // Recomputed live every render — reflects is_repeater the moment quick-facts
  // sets it, exactly like the post-login onboarding modal's key-based screens.
  const stepKeys = stepKeysFor();
  const TOTAL_SCREENS = stepKeys.length; // excludes the final login/build screen from the progress bar
  const currentKey = stepIdx < stepKeys.length ? stepKeys[stepIdx] : 'login-build';

  useEffect(() => {
    try { window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ stepIdx, data, savedAt: Date.now() })); } catch { /* best-effort */ }
  }, [stepIdx, data]);

  // Funnel beacon: record which onboarding screen this visitor reached.
  useEffect(() => {
    trackFunnel(`start:${currentKey}`);
  }, [currentKey]);

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
      content = <ScreenLoginBuild isLoading={false} onboarding={data} />;
  }

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
        {content}
      </div>
    </div>
  );
}
