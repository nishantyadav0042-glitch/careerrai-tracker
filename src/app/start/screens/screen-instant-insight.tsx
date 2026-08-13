'use client';

import { AlertTriangle, Bell, CheckCircle2, TrendingUp } from 'lucide-react';
import { computePrepInsight, type MatrixEntry, type PrepSignal } from '@/lib/prep-insight-engine';

// ── Instant Insight — the WOW moment, before the account even exists ────────
//
// Rebuilt 13 Aug after the founder tested his own funnel and rejected what
// was here: one if/else chain picked ONE paragraph, so most students landed
// in the same few sentences regardless of their actual 53-topic map — and
// the headline number was topic COUNT ("10/28 done"), which means almost
// nothing in CAT (30 low-weight topics finished still leaves the exam's
// real marks untouched). His words: "no student will feel like we really
// recognised any pattern or problem."
//
// The rebuild moved the actual thinking into src/lib/prep-insight-engine.ts
// — a real detector engine (severity + confidence per finding, ranked, top
// 3 shown) instead of one hand-picked branch. This file is now render-only:
// pass what the student answered, show what the engine found.
//
// The shape is fixed on purpose: position 1-2 are the sharpest real findings
// for THIS student, position 3 is always a genuine strength — a screen
// that's all red reads as a scare tactic, not a mirror (founder: the green
// card "is not decoration, it's a trust mechanism").
//
// Never "AI insight" anywhere on this screen (founder, 13 Aug) — the
// emotional target is "CareerRai knows my prep," not "AI generated text."

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

function positionLabel(card: PrepSignal, position: 0 | 1 | 2): string {
  if (position === 2) return 'YOUR ADVANTAGE';
  if (position === 1) return 'THE PATTERN WE FOUND';
  return card.severity >= 7 ? 'YOUR BIGGEST RISK' : 'WHAT STANDS OUT';
}

function Card({ card, position }: { card: PrepSignal; position: 0 | 1 | 2 }) {
  const style = POLARITY_STYLE[card.polarity];
  const Icon = style.icon;
  return (
    <div className={`rounded-2xl border-2 ${style.border} ${style.bg} p-4`}>
      <div className="flex items-start gap-2.5">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.iconColor}`} />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500">{positionLabel(card, position)}</p>
          <p className="mt-0.5 text-sm font-semibold leading-snug text-stone-900">{card.headline}</p>
          {card.stats && card.stats.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
              {card.stats.map((s) => (
                <span key={s} className="font-mono text-[11px] text-stone-600">{s}</span>
              ))}
            </div>
          )}
          {card.note && <p className="mt-1 text-[12px] leading-snug text-stone-600">{card.note}</p>}
        </div>
      </div>
    </div>
  );
}

export default function ScreenInstantInsight({ onNext, matrix, isRepeater, ambitionDate = null, selfStudyHours = null, lastYearPercentile = null }: Props) {
  const today = new Date();
  const result = computePrepInsight({
    matrix, ambitionDate, selfStudyHours: selfStudyHours ?? null,
    isRepeater: isRepeater ?? null, lastYearPercentile, today,
  });
  const { fresh, weightedCoverage, cards, synthesis } = result;

  return (
    <div className="space-y-4 pt-1">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500">Your first insight — free, before signup</p>
        <h1 className="mt-1 text-2xl font-bold leading-snug text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
          {fresh ? 'Here’s your starting position.' : "Here's what your prep actually looks like."}
        </h1>
      </div>

      {fresh ? (
        <div className="flex items-start gap-2.5 rounded-2xl border-2 border-stone-300 bg-stone-50 p-4">
          <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-stone-600" />
          <p className="text-sm font-medium leading-relaxed text-stone-800">
            Clean slate. Start where the marks are: Arithmetic, Reading Comprehension, Arrangements.
          </p>
        </div>
      ) : (
        <>
          {/* The number that replaces topic count — MARKS covered, not taps
              made. A student can finish 30 low-weight topics and still be
              exposed everywhere the paper actually asks. */}
          <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
            <div className="flex items-baseline justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Weighted coverage</p>
              <p className="text-lg font-bold text-stone-900">{weightedCoverage.donePct}%</p>
            </div>
            <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-stone-200">
              <div className="h-full bg-emerald-500" style={{ width: `${weightedCoverage.donePct}%` }} />
              <div className="h-full bg-amber-400" style={{ width: `${weightedCoverage.inProgressPct}%` }} />
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] text-stone-500">
              <span>{weightedCoverage.donePct}% done</span>
              <span>{weightedCoverage.inProgressPct}% in progress</span>
              <span>{weightedCoverage.untouchedPct}% untouched</span>
            </div>
          </div>

          <div className="space-y-2.5">
            {cards.map((card, i) => (
              <Card key={card.key} card={card} position={i as 0 | 1 | 2} />
            ))}
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
