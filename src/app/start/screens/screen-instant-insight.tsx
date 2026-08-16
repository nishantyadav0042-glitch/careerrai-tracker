'use client';

import { AlertTriangle, CheckCircle2, TrendingUp } from 'lucide-react';
import { computePrepInsight, discoverySection, type MatrixEntry, type PrepSignal, type SectionCoverage, type SelfReportStatus } from '@/lib/prep-insight-engine';

// ── Instant Insight — the WOW moment, before the account even exists ────────
//
// Rebuilt 13 Aug after the founder tested his own funnel and rejected what
// was here: one if/else chain picked ONE paragraph, so most students landed
// in the same few sentences regardless of their actual 53-topic map, and the
// headline number was topic COUNT ("10/28 done") — which means almost
// nothing in CAT. His words: "no student will feel like we really recognised
// any pattern or problem."
//
// Rebuilt again 15 Aug (Preparation Insight Engine, final spec) to fix a
// second, worse bug: `self_reported_weakest_section` was collected one
// screen earlier and never reached this one. A student who said "VARC is my
// weakest" could be told a QA foundation gap with no acknowledgment the two
// disagreed — CareerRai answering a question the student didn't ask. The
// self-report now flows all the way through, is ALWAYS acknowledged, and is
// never silently overridden or used to suppress a real finding elsewhere —
// see prep-insight-engine.ts's Validation/Discovery split.
//
// All the thinking lives in src/lib/prep-insight-engine.ts. This file is
// render-only: pass what the student answered, show what the engine found.
//
// ── What this screen may and may not show ────────────────────────────────
//
// NO CARD QUOTA. The engine returns a primary finding and an OPTIONAL
// secondary — never three equal cards (that read as "three generic
// observations," not as CareerRai having looked at THIS student's prep).
//
// NO GLOBAL COVERAGE PERCENTAGE. Coverage is shown per section only, each
// weighted within itself, because `weightage` is defined as "relative
// emphasis within its OWN section" — summing it across sections invents a
// CAT mark distribution we have not measured. The word "marks" appears
// nowhere on this screen for the same reason, and no topic is ever called
// "high weightage" as a stand-in for "heavily tested."
//
// HONEST EMPTY STATE. A barely-started OR a saturated (nothing measurably
// distinguishes the three sections) student is told plainly that we don't
// have enough to name a weakness yet, and given a real first move instead of
// a manufactured — or arbitrarily tie-broken — insight.
//
// YOU TOLD US vs WE NOTICED. Every section name on this screen is
// attributable: `result.primarySource` says whether it came from the
// student's own tap or from CareerRai's own look at the coverage data, and
// the copy below must never blur the two.
//
// Never "AI insight" anywhere here (founder, 13 Aug) — the target feeling is
// "CareerRai knows my prep," not "AI generated text."

interface Props {
  onNext: (data?: Record<string, unknown>) => void;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
  matrix: MatrixEntry[] | null;
  isRepeater?: boolean;
  /** ISO date, the syllabus finish date the student committed to. Null in
   *  onboarding-modal's call site, where this screen runs BEFORE that date
   *  is collected — the date-arithmetic detector simply doesn't fire there. */
  ambitionDate?: string | null;
  /** Self-study hours/day. Same null-when-not-yet-collected story as above. */
  selfStudyHours?: number | null;
  lastYearPercentile?: number | null;
  /** What the student answered one screen earlier — perception, never
   *  ground truth. Null section + 'NOT_SURE_YET' status is a real, honest
   *  answer, not a skip; null + null status means we don't know why (almost
   *  always a student who predates this question entirely). */
  selfReportedWeakestSection?: 'VARC' | 'DILR' | 'QA' | null;
  selfReportStatus?: SelfReportStatus;
}

const POLARITY_STYLE: Record<PrepSignal['polarity'], { icon: typeof AlertTriangle; border: string; bg: string; badgeBg: string }> = {
  risk: { icon: AlertTriangle, border: 'border-red-300', bg: 'bg-red-50', badgeBg: 'bg-red-600' },
  pattern: { icon: TrendingUp, border: 'border-orange-300', bg: 'bg-orange-50', badgeBg: 'bg-orange-600' },
  strength: { icon: CheckCircle2, border: 'border-emerald-300', bg: 'bg-emerald-50', badgeBg: 'bg-emerald-600' },
};

/** The hero. One realization, its evidence, the feeling it names, and what
 *  changes because of it — in that order, and visually dominant. The student
 *  should remember ONE thing from this screen, so only this card gets room. */
function HeroCard({ card }: { card: PrepSignal }) {
  const style = POLARITY_STYLE[card.polarity];
  const Icon = style.icon;
  return (
    <div className={`rounded-2xl border-2 ${style.border} ${style.bg} p-5`}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full shadow-sm ${style.badgeBg}`}>
          <Icon className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[19px] font-bold leading-[1.25] text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
            {card.headline}
          </h2>
          {card.stats && card.stats.length > 0 && (
            <div className="mt-3 space-y-1">
              {card.stats.map((st) => (
                <p key={st} className="font-mono text-[12px] leading-snug text-stone-700">{st}</p>
              ))}
            </div>
          )}
          {card.note && <p className="mt-3 text-[13.5px] leading-relaxed text-stone-700">{card.note}</p>}
        </div>
      </div>
      {card.action && (
        <div className="mt-4 border-t border-stone-900/10 pt-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500">What we&apos;ll do</p>
          <p className="mt-1 text-[13.5px] font-medium leading-snug text-stone-900">{card.action}</p>
        </div>
      )}
    </div>
  );
}

/** Secondary findings — deliberately one quiet line each. They exist so the
 *  screen feels complete, never to compete with the hero for attention. */
function MinorLine({ card }: { card: PrepSignal }) {
  const dot = card.polarity === 'strength' ? 'bg-emerald-500' : card.polarity === 'risk' ? 'bg-red-500' : 'bg-orange-500';
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      <p className="text-[13px] leading-snug text-stone-700">{card.headline}</p>
    </div>
  );
}

/** Belief acknowledgement — always renders first when a self-report exists,
 *  never folded silently into a finding. "You told us X" only when X really
 *  is what the student said; "You weren't sure" for NOT_SURE_YET; nothing at
 *  all for a student who never got the question (historical null). */
function BeliefAck({ status, section }: { status: SelfReportStatus; section: 'VARC' | 'DILR' | 'QA' | null }) {
  if (status === 'SELECTED_SECTION' && section) {
    return (
      <p className="text-[13.5px] leading-relaxed text-stone-600">
        You told us <span className="font-semibold text-orange-700">{section}</span> feels weakest.
      </p>
    );
  }
  if (status === 'NOT_SURE_YET') {
    return (
      <p className="text-[13.5px] leading-relaxed text-stone-600">
        You weren&apos;t sure which section feels weakest yet — fair enough, that&apos;s exactly what we&apos;re here to help work out.
      </p>
    );
  }
  return null;
}

/** The section-disclosure line — only rendered when `discoverySection`
 *  returns non-null. Names where the finding actually came from without
 *  claiming it's now "the real weakness" (never "actually your weakness
 *  is..."), and without any causal or weightage language the evidence
 *  doesn't support — it states the one fact the student needs to feel the
 *  discovery: CareerRai looked somewhere they didn't mention. */
function DiscoveryAck({ section }: { section: 'VARC' | 'DILR' | 'QA' }) {
  return (
    <p className="text-[13.5px] leading-relaxed text-stone-600">
      We noticed something in <span className="font-semibold text-orange-700">{section}</span> you may not have been watching:
    </p>
  );
}

// ── The daily-insight promise ────────────────────────────────────────────
//
// Founder, 16 Aug: this line — "you'll get one of these every evening" — is
// the actual habit-loop pitch (Duolingo/Reddit, not a one-time quiz), and it
// used to be quiet gray text after a full scroll, indistinguishable from any
// other utility line on the screen. It now gets the one deliberate accent
// color on this screen (a dusk gradient — the sky the evening insight
// actually arrives under), used ONLY here and at the bottom callout and CTA
// caption below, so it's recognized as the same promise every time it
// appears rather than blending into everything else.
const DUSK_GRADIENT = 'linear-gradient(115deg, #2E1F66 0%, #7C3AED 45%, #EA8A2B 100%)';
const DUSK_GRADIENT_SOFT = 'linear-gradient(150deg, #241A54 0%, #6D2FA8 52%, #D9791F 100%)';

/** The top badge — same promise as the bottom callout, compact, so it's
 *  seen within the first screenful instead of only after scrolling past
 *  the hero card. */
function DailyInsightBadge() {
  return (
    <div
      className="inline-flex self-start rounded-full px-3.5 py-1.5 text-[12px] font-semibold text-orange-50"
      style={{ backgroundImage: DUSK_GRADIENT }}
    >
      One insight like this — every evening
    </div>
  );
}

/** Coverage per section, weighted WITHIN each section — never summed across
 *  them, because `weightage` means "relative emphasis within its OWN
 *  section". Shows the weighted figure rather than a topic count: finishing
 *  20 light topics and 20 heavy ones are not the same preparation, and the
 *  count says they are. */
function SectionBars({ coverage }: { coverage: SectionCoverage[] }) {
  return (
    <div className="space-y-2 rounded-2xl border border-stone-200 bg-stone-50 p-4">
      {coverage.map((s) => (
        <div key={s.sec} className="flex items-center gap-2.5">
          <span className="w-11 shrink-0 text-xs font-bold text-stone-600">{s.sec}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-200">
            <div className="h-full rounded-full bg-stone-700" style={{ width: `${s.donePct}%` }} />
          </div>
          <span className="w-9 shrink-0 text-right font-mono text-[11px] tabular-nums text-stone-500">{s.donePct}%</span>
        </div>
      ))}
    </div>
  );
}

export default function ScreenInstantInsight({
  onNext, matrix, isRepeater, ambitionDate = null, selfStudyHours = null, lastYearPercentile = null,
  selfReportedWeakestSection = null, selfReportStatus = null,
}: Props) {
  const today = new Date();
  const result = computePrepInsight({
    matrix, ambitionDate, selfStudyHours: selfStudyHours ?? null,
    isRepeater: isRepeater ?? null, lastYearPercentile, today,
    selfReportedWeakestSection, selfReportStatus,
  });
  const { state, sectionCoverage, primary, secondary, primarySource, strength, startingPoints } = result;

  // ONE realization gets the room; the secondary is a quiet line, never a
  // forced second card. `cards`/`synthesis` are deliberately unused here —
  // primary/secondary already carry the self-report-aware selection `cards`
  // doesn't (see prep-insight-engine.ts's Validation/Discovery split).
  const hero = primary ?? strength ?? null;
  const minor = [secondary, strength && hero !== strength ? strength : null].filter((c): c is PrepSignal => c != null);
  const disclosedSection = discoverySection(primary, primarySource);

  return (
    <div className="space-y-4 pt-1">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500">Your first insight — free, before signup</p>
        <h1 className="mt-1 text-2xl font-bold leading-snug text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
          {state === 'insufficient_evidence' ? (
            'You\u2019re right at the start.'
          ) : (
            <>
              We{' '}
              <span style={{ backgroundImage: 'linear-gradient(180deg, transparent 62%, #FED7AA 62%)' }}>found something</span>
              {' '}in your prep.
            </>
          )}
        </h1>
      </div>

      <DailyInsightBadge />

      <div className="space-y-1.5">
        <BeliefAck status={selfReportStatus} section={selfReportedWeakestSection} />
        {disclosedSection && <DiscoveryAck section={disclosedSection} />}
      </div>

      {state === 'insufficient_evidence' ? (
        <>
          {/* No manufactured insight. Telling a student we don't have enough
              to diagnose yet — and then giving them a real first move — is
              more trustworthy than dressing up "VARC is untouched" as a
              discovery they made themselves 30 seconds ago. This is ALSO the
              saturation-guard state (Scheduling ≠ Insight spec, Part E): when
              the matrix can't distinguish sections at all, we say so instead
              of a tie-broken guess — real production data proved that guess
              would land on the same section almost every time, for no reason
              but arithmetic. */}
          <div className="rounded-2xl border-2 border-stone-300 bg-stone-50 p-5">
            <h2 className="text-[18px] font-bold leading-snug text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
              {selfReportStatus
                ? 'We don’t have enough evidence yet to confidently call one section your weakest.'
                : 'We won’t invent a weakness you haven’t shown us yet.'}
            </h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-stone-700">
              {selfReportStatus === 'NOT_SURE_YET'
                ? 'Your mocks will help us sharpen this as you go.'
                : 'You’ve mapped your syllabus, but there isn’t enough history yet to name a real pattern. Your first job isn’t fixing weaknesses — it’s building a baseline worth reading.'}
            </p>
          </div>
          {startingPoints.length > 0 && (
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Where we&apos;ll start you</p>
              <div className="mt-2 space-y-1.5">
                {startingPoints.map((sp) => (
                  <div key={sp.sec} className="flex items-baseline gap-2.5 text-sm">
                    <span className="w-11 shrink-0 text-xs font-bold text-stone-500">{sp.sec}</span>
                    <span className="font-semibold text-stone-900">{sp.topic}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2.5 text-[11.5px] leading-snug text-stone-500">
                Highest-priority in their section, and nothing has to come before them.
              </p>
            </div>
          )}
        </>
      ) : (
        <>
          {hero && <HeroCard card={hero} />}

          {minor.length > 0 && (
            <div className="rounded-2xl border border-stone-200 bg-white px-4 py-2.5">
              <p className="mb-0.5 text-[10px] font-bold uppercase tracking-widest text-stone-500">Also noticed</p>
              {minor.map((c) => <MinorLine key={c.key} card={c} />)}
            </div>
          )}

          <SectionBars coverage={sectionCoverage} />
        </>
      )}

      {/* The hook: this is what CareerRai does daily — restyled 16 Aug in the
          same dusk accent as DailyInsightBadge above, so a student who
          scrolled past the badge recognizes this as the same promise, not a
          second unrelated line. Never "AI" anywhere here (founder, 13 Aug) —
          the target feeling is "CareerRai knows my prep," not "AI generated
          some text." */}
      <div className="rounded-2xl p-4" style={{ backgroundImage: DUSK_GRADIENT_SOFT }}>
        <p className="text-[14.5px] font-bold leading-snug text-orange-50">You&apos;ll get one insight like this every evening, once you start.</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-purple-100">Not a one-time score — a fresh read on your prep, every night.</p>
      </div>

      {/* Sticky, like every other decision screen in this funnel.
          Measured 10 Aug on Pixel 5, iPhone SE and iPhone 13: this screen runs
          34–68px past the fold, and this was the ONE screen whose button sat in
          the scroll instead of pinned to the bottom — so on all three devices
          the student had to scroll to find it.
          Of all the places to hide the button, this is the worst: it is the
          diagnosis screen, the moment the pitch lands, and the last thing
          between an ad click and the signup form. */}
      <div className="sticky bottom-0 z-20 bg-white/95 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
        <p className="mb-1.5 text-center text-[11.5px] font-semibold text-purple-700">Then: a fresh insight every evening.</p>
        <button
          type="button"
          onClick={() => onNext(primary ? {
            // The Insight→Plan handoff (final spec, Part J): carry what was
            // ACTUALLY shown into signup, so the real plan can later be
            // compared against it instead of the two silently diverging.
            // Never invented from the section alone — always the literal
            // signal that rendered as the hero card. Only `primary` (a real
            // risk/pattern with something to act on) is carried — a
            // strength-only hero has no "recommended action" to align a
            // plan against, so persisting it would manufacture a
            // DIFFERENT_BUT_VALID disclosure that means nothing.
            onboarding_insight_section: primary.section,
            onboarding_insight_topic: primary.topic ?? null,
            onboarding_insight_source: primarySource,
            onboarding_insight_root_cause: primary.rootCause,
            onboarding_insight_recommend: primary.recommend,
          } : undefined)}
          className="w-full rounded-2xl bg-stone-900 py-4 text-sm font-semibold text-white transition-all hover:bg-stone-800 active:scale-[0.98]"
        >
          Build my plan around this →
        </button>
      </div>
    </div>
  );
}
