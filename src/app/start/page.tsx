'use client';

import { useEffect, useState } from 'react';
import { Logo } from '@/components/logo';
import ScreenNeedCheck from './screens/screen-need-check';
import ScreenTargetDate from './screens/screen-target-date';
import ScreenDreamPercentile from './screens/screen-dream-percentile';
import ScreenQuickFacts from './screens/screen-quick-facts';
import ScreenPainPoints from './screens/screen-pain-points';
import ScreenRealityCheck from '@/app/student/onboarding/screens/screen-reality-check';
import ScreenTopicCoverage from '@/app/student/onboarding/screens/screen-topic-coverage';
import ScreenMentor from './screens/screen-mentor';
import ScreenSocialProof from '@/app/student/onboarding/screens/screen-social-proof';
import ScreenLoginBuild from './screens/screen-login-build';
import type { CoverageSectionId } from '@/lib/topics-constants';
import { trackFunnel } from '@/lib/funnel';

// Screen names for the funnel beacon — index matches stepIdx.
const FUNNEL_STEPS = ['need-check', 'target-date', 'dream-percentile', 'quick-facts', 'pain-points', 'reality-check', 'topic-coverage', 'mentor', 'social-proof', 'login-build'];

// Founder-directed rebuild: every onboarding question now happens BEFORE
// the account exists — "you decide the date, you own the plan" comes first,
// signup comes last as "log in while we build." Nothing here writes to
// Supabase until ScreenLoginBuild's verify call, which hands the whole
// accumulated payload over in one request.
const TOTAL_SCREENS = 9; // excludes the final login/build screen from the progress bar
// v2: bumping the key invalidates every draft saved before clear-on-signup existed.
// v3: reality-check (3 questions) + social-proof (testimonial) screens added.
// v4: removed the standalone reassurance screen (redundant with reality-check).
const DRAFT_KEY = 'cr_preauth_draft_v4';
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
  const [stepIdx, setStepIdx] = useState(() => Math.min(draft?.stepIdx ?? 0, TOTAL_SCREENS - 1));
  const [data, setData] = useState<Record<string, unknown>>(() => draft?.data ?? {});

  useEffect(() => {
    try { window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ stepIdx, data, savedAt: Date.now() })); } catch { /* best-effort */ }
  }, [stepIdx, data]);

  // Funnel beacon: record which onboarding screen this visitor reached.
  useEffect(() => {
    trackFunnel(`start:${FUNNEL_STEPS[Math.min(stepIdx, FUNNEL_STEPS.length - 1)]}`);
  }, [stepIdx]);

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
  switch (stepIdx) {
    case 0:
      content = <ScreenNeedCheck onNext={advance} isLoading={false} />;
      break;
    case 1:
      content = <ScreenTargetDate onNext={advance} {...shared} />;
      break;
    case 2:
      content = <ScreenDreamPercentile onNext={advance} {...shared} />;
      break;
    case 3:
      content = <ScreenQuickFacts onNext={advance} {...shared} />;
      break;
    case 4:
      content = <ScreenPainPoints onNext={advance} {...shared} />;
      break;
    case 5:
      content = <ScreenRealityCheck onNext={advance} {...shared} />;
      break;
    case 6:
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
    case 7:
      content = <ScreenMentor onNext={advance} {...shared} />;
      break;
    case 8:
      content = <ScreenSocialProof onNext={advance} {...shared} />;
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
