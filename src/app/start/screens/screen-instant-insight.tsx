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

function Card({ card, label, hero }: { card: PrepSignal; label: string; hero?: boolean }) {
  const style = POLARITY_STYLE[card.polarity];
  const Icon = style.icon;
  return (
    <div className={`rounded-2xl border-2 ${style.border} ${style.bg} ${hero ? 'p-4' : 'p-3.5'}`}>
      <div className="flex items-start gap-2.5">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.iconColor}`} />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500">{label}</p>
          <p className={`mt-0.5 font-semibold leading-snug text-stone-900 ${hero ? 'text-[15.5px]' : 'text-sm'}`}>{card.headline}</p>
          {card.stats && card.stats.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
              {card.stats.map((st) => (
                <span key={st} className="font-mono text-[11px] text-stone-600">{st}</span>
              ))}
            </div>
          )}
          {card.note && <p className="mt-1 text-[12px] leading-snug text-stone-600">{card.note}</p>}
        </div>
      </div>
    </div>
  );
}

/** Coverage per section, weighted WITHIN each section — never summed across
 *  them. `weightage` means "relative emphasis within its OWN section", so one
 *  cross-section percentage would be a fabricated paper distribution. */
function SectionBars({ coverage }: { coverage: SectionCoverage[] }) {
  return (
    <div className="space-y-2 rounded-2xl border border-stone-200 bg-stone-50 p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Where you stand</p>
      {coverage.map((s) => (
        <div key={s.sec} className="flex items-center gap-2">
          <span className="w-11 shrink-0 text-xs font-bold text-stone-600">{s.sec}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-stone-200">
            <div className="h-full bg-emerald-500" style={{ width: `${s.donePct}%` }} />
          </div>
          <span className="w-20 shrink-0 text-right font-mono text-[11px] text-stone-500">
            {s.finishedCount}/{s.totalCount} done
          </span>
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
  const { state, sectionCoverage, cards, strength, startingPoints, synthesis } = result;

  const heroLabel = (c: PrepSignal) => (c.polarity === 'risk' && c.severity >= 8 ? 'YOUR BIGGEST RISK' : 'WHAT STANDS OUT');

  return (
    <div className="space-y-4 pt-1">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500">Your first insight — free, before signup</p>
        <h1 className="mt-1 text-2xl font-bold leading-snug text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
          {state === 'insufficient_evidence' ? 'You\u2019re right at the start.' : "Here's what your prep actually looks like."}
        </h1>
      </div>

      {state === 'insufficient_evidence' ? (
        <>
          {/* No manufactured insight. Telling a student we don't have enough
              to diagnose yet — and then giving them a real first move — is
              more trustworthy than dressing up "VARC is untouched" as a
              discovery they made themselves 30 seconds ago. */}
          <div className="rounded-2xl border-2 border-stone-300 bg-stone-50 p-4">
            <p className="text-sm font-semibold leading-snug text-stone-900">
              We don&apos;t have enough of your history yet to name a real weakness.
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-stone-600">
              That&apos;s normal this early — and your first job isn&apos;t fixing weaknesses, it&apos;s building a baseline.
            </p>
          </div>
          {startingPoints.length > 0 && (
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Where to start</p>
              <div className="mt-2 space-y-1.5">
                {startingPoints.map((sp) => (
                  <div key={sp.sec} className="flex items-baseline gap-2.5 text-sm">
                    <span className="w-11 shrink-0 text-xs font-bold text-stone-500">{sp.sec}</span>
                    <span className="font-semibold text-stone-900">{sp.topic}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11.5px] text-stone-500">
                High-priority in their section, and nothing has to come first.
              </p>
            </div>
          )}
        </>
      ) : (
        <>
          <SectionBars coverage={sectionCoverage} />

          <div className="space-y-2.5">
            {cards.map((card, i) => (
              <Card key={card.key} card={card} hero={i === 0} label={i === 0 ? heroLabel(card) : 'ALSO WORTH KNOWING'} />
            ))}
            {strength && <Card card={strength} label="WORTH PROTECTING" />}
          </div>

          {synthesis && (
            <p className="px-1 text-[13px] font-medium leading-snug text-stone-700">
              {synthesis.charAt(0).toUpperCase() + synthesis.slice(1)}.
            </p>
          )}
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
