'use client';

import { AlertTriangle, Bell, CheckCircle2, TrendingUp } from 'lucide-react';
import { computePrepInsight, type MatrixEntry, type PrepSignal, type SectionCoverage } from '@/lib/prep-insight-engine';

// ── Instant Insight — the WOW moment, before the account even exists ────────
//
// Rebuilt 13 Aug after the founder tested his own funnel and rejected what
// was here: one if/else chain picked ONE paragraph, so most students landed
// in the same few sentences regardless of their actual 53-topic map, and the
// headline number was topic COUNT ("10/28 done") — which means almost
// nothing in CAT. His words: "no student will feel like we really recognised
// any pattern or problem."
//
// All the thinking lives in src/lib/prep-insight-engine.ts. This file is
// render-only: pass what the student answered, show what the engine found.
//
// ── What this screen may and may not show ────────────────────────────────
//
// NO CARD QUOTA. The engine returns 0-2 findings plus an optional earned
// strength. An earlier version guaranteed three cards, which forced filler
// ("VARC is completely untouched" — the student tapped that themselves) and
// once printed "QA is your strongest" directly beneath "your QA foundation
// is broken". If the evidence supports one finding, the student sees one.
//
// NO GLOBAL COVERAGE PERCENTAGE. Coverage is shown per section only, each
// weighted within itself, because `weightage` is defined as "relative
// emphasis within its OWN section" — summing it across sections invents a
// CAT mark distribution we have not measured. The word "marks" appears
// nowhere on this screen for the same reason.
//
// HONEST EMPTY STATE. A barely-started student is told plainly that we
// don't have enough history to name a weakness yet, and given a real first
// move instead of a manufactured insight.
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
}

const POLARITY_STYLE: Record<PrepSignal['polarity'], { icon: typeof AlertTriangle; border: string; bg: string; iconColor: string }> = {
  risk: { icon: AlertTriangle, border: 'border-red-300', bg: 'bg-red-50', iconColor: 'text-red-600' },
  pattern: { icon: TrendingUp, border: 'border-orange-300', bg: 'bg-orange-50', iconColor: 'text-orange-600' },
  strength: { icon: CheckCircle2, border: 'border-emerald-300', bg: 'bg-emerald-50', iconColor: 'text-emerald-600' },
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
        <Icon className={`mt-1 h-5 w-5 shrink-0 ${style.iconColor}`} />
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

export default function ScreenInstantInsight({ onNext, matrix, isRepeater, ambitionDate = null, selfStudyHours = null, lastYearPercentile = null }: Props) {
  const today = new Date();
  const result = computePrepInsight({
    matrix, ambitionDate, selfStudyHours: selfStudyHours ?? null,
    isRepeater: isRepeater ?? null, lastYearPercentile, today,
  });
  const { state, sectionCoverage, cards, strength, startingPoints } = result;

  // ONE realization gets the room; everything else is a quiet line. The
  // previous three-equal-cards grid meant the student remembered nothing —
  // three findings of identical visual weight read as a report, not a
  // reveal. `synthesis` is deliberately unused now: the hero's own "what
  // we'll do" says it better than a concatenated sentence at the bottom.
  const hero = cards[0] ?? strength ?? null;
  const minor = [...cards.slice(1), ...(strength && hero !== strength ? [strength] : [])];

  return (
    <div className="space-y-4 pt-1">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500">Your first insight — free, before signup</p>
        <h1 className="mt-1 text-2xl font-bold leading-snug text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
          {state === 'insufficient_evidence' ? 'You\u2019re right at the start.' : 'We found something in your prep.'}
        </h1>
      </div>

      {state === 'insufficient_evidence' ? (
        <>
          {/* No manufactured insight. Telling a student we don't have enough
              to diagnose yet — and then giving them a real first move — is
              more trustworthy than dressing up "VARC is untouched" as a
              discovery they made themselves 30 seconds ago. */}
          <div className="rounded-2xl border-2 border-stone-300 bg-stone-50 p-5">
            <h2 className="text-[18px] font-bold leading-snug text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
              We won&apos;t invent a weakness you haven&apos;t shown us yet.
            </h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-stone-700">
              You&apos;ve mapped your syllabus, but there isn&apos;t enough history yet to name a real pattern.
              Your first job isn&apos;t fixing weaknesses — it&apos;s building a baseline worth reading.
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

      {/* The hook: this is what CareerRai does daily — one line, not a pitch.
          Never "AI" anywhere here (founder, 13 Aug) — the target feeling is
          "CareerRai knows my prep," not "AI generated some text." */}
      <div className="flex items-center gap-2.5 rounded-2xl border border-stone-200 bg-stone-50 p-4">
        <Bell className="h-4 w-4 shrink-0 text-stone-900" />
        <p className="text-sm text-stone-600">You&apos;ll get one insight like this every evening, once you start.</p>
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
        <button
          type="button"
          onClick={() => onNext()}
          className="w-full rounded-2xl bg-stone-900 py-4 text-sm font-semibold text-white transition-all hover:bg-stone-800 active:scale-[0.98]"
        >
          Build my plan around this →
        </button>
      </div>
    </div>
  );
}
