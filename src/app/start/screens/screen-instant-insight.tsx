'use client';

import { AlertTriangle, Bell, Target } from 'lucide-react';
import { TOPIC_METADATA } from '@/lib/topics-constants';

// Instant Insight (founder, 21 July): the WOW moment, seconds after the
// student declares their coverage — BEFORE the account even exists. The rule:
// every sentence must be computed from what THEY just tapped, and at least
// one fact should make them think "shi me yrr, ye toh tagda issue". Then the
// hook: "you get one insight like this every evening — in the app."
//
// The killer math (all real, from TOPIC_METADATA weightages): compare the
// total mark-weight of their UNTOUCHED high-weightage topics in their weakest
// section against the mark-weight of everything they've FINISHED there. When
// the untouched pile outweighs the finished pile, say exactly that — it's
// verifiable, personal, and usually a shock.

type DeclaredStatus = 'not_started' | 'learning' | 'practicing' | 'revising';
interface MatrixEntry { section: string; topic: string; status: DeclaredStatus }

interface Props {
  onNext: (data?: Record<string, unknown>) => void;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
  matrix: MatrixEntry[] | null;
  isRepeater?: boolean;
}

const CORE_SECTIONS = ['QA', 'VARC', 'DILR'] as const;

export default function ScreenInstantInsight({ onNext, matrix, isRepeater }: Props) {
  // Only topics the engine knows (QA/VARC/DILR with metadata) — MOCKS/READING
  // rows in the declared matrix aren't syllabus topics.
  const entries = (matrix ?? []).filter((m) => TOPIC_METADATA[m.topic] && CORE_SECTIONS.includes(TOPIC_METADATA[m.topic].section as typeof CORE_SECTIONS[number]));

  const bySection = CORE_SECTIONS.map((sec) => {
    const secEntries = entries.filter((m) => TOPIC_METADATA[m.topic].section === sec);
    const finished = secEntries.filter((m) => m.status === 'practicing' || m.status === 'revising');
    const learning = secEntries.filter((m) => m.status === 'learning');
    const untouched = secEntries.filter((m) => m.status === 'not_started');
    const gap = secEntries.length ? (untouched.length * 2 + learning.length) / secEntries.length : 0;
    return { sec, secEntries, finished, learning, untouched, gap };
  });
  const tieOrder: Record<string, number> = { DILR: 0, QA: 1, VARC: 2 };
  const weakest = [...bySection].sort((a, b) => b.gap - a.gap || tieOrder[a.sec] - tieOrder[b.sec])[0];
  const fresh = bySection.every((s) => s.finished.length === 0 && s.learning.length === 0);

  // The killer fact: untouched high-weightage vs finished, by real mark-weight.
  const weight = (ms: MatrixEntry[]) => ms.reduce((sum, m) => sum + (TOPIC_METADATA[m.topic]?.weightage ?? 0), 0);
  const heavyUntouched = weakest.untouched
    .filter((m) => (TOPIC_METADATA[m.topic]?.weightage ?? 0) >= 4)
    .sort((a, b) => (TOPIC_METADATA[b.topic]?.weightage ?? 0) - (TOPIC_METADATA[a.topic]?.weightage ?? 0));
  const untouchedHeavyWeight = weight(heavyUntouched);
  const finishedWeight = weight(weakest.finished);
  const inversion = !fresh && heavyUntouched.length > 0 && untouchedHeavyWeight > finishedWeight && weakest.finished.length > 0;

  // ── The recognition library (founder, 21 July: "damn, this is true, I've
  // been making this mistake for months") ────────────────────────────────────
  // Each pattern names a BEHAVIOUR the student will recognise as their own —
  // not a stat. Priority = recognition power. Every fact is computed from
  // their taps; the habit rows (Full Length Mocks, Error Log, Mock Analysis,
  // reading) come straight from the matrix's MOCKS/READING sections.
  const raw = matrix ?? [];
  const habit = (name: string) => raw.find((m) => m.topic === name)?.status ?? null;
  const statusOf = (name: string) => entries.find((m) => m.topic === name)?.status ?? null;
  const totalFinished = bySection.reduce((s, x) => s + x.finished.length, 0);
  const totalLearning = bySection.reduce((s, x) => s + x.learning.length, 0);
  const groupStats = (units: string[]) => {
    const g = entries.filter((m) => units.includes(m.topic));
    return {
      finished: g.filter((m) => m.status === 'practicing' || m.status === 'revising').length,
      untouched: g.filter((m) => m.status === 'not_started').length,
      total: g.length,
    };
  };
  const arith = groupStats(['Percentages', 'Profit & Loss', 'Ratio & Proportion', 'Average', 'Mixtures', 'Time & Work', 'Pipes & Cisterns', 'Time Speed Distance', 'SI & CI']);
  const hardQa = groupStats(['Linear Equations', 'Quadratic Equations', 'Functions', 'Inequalities', 'Logarithms', 'Progressions', 'Divisibility', 'HCF & LCM', 'Remainders', 'Base System', 'Lines & Angles', 'Triangles', 'Quadrilaterals', 'Circles', 'Mensuration', 'Coordinate Geometry']);
  const rcStatus = statusOf('Reading Comprehension');
  const vaTouched = entries.filter((m) => ['Para Jumbles', 'Para Summary', 'Odd One Out', 'Para Completion', 'Vocabulary'].includes(m.topic) && m.status !== 'not_started').length;
  const fullMocks = habit('Full Length Mocks');
  const errorLog = habit('Error Log');
  const mockAnalysis = habit('Mock Analysis');

  // ── One short line, not a paragraph (founder, 13 Aug: "too much, no one
  // will read a single line") ─────────────────────────────────────────────
  // Same real math as before — every number and topic name still comes
  // straight from what the student just tapped. Only the WORDS changed:
  // one plain sentence, no second clause explaining why it matters. The
  // section bars above already carry the "why" visually.
  let flag: string;
  if (fresh) {
    flag = `Clean slate. Start where the marks are: Arithmetic, Reading Comprehension, Arrangements.`;
  } else if (inversion) {
    const names = heavyUntouched.slice(0, 2).map((m) => m.topic).join(' and ');
    flag = `${names} carr${heavyUntouched.length === 1 ? 'ies' : 'y'} more marks than everything you've finished in ${weakest.sec}.`;
  } else if (totalFinished >= 8 && fullMocks === 'not_started') {
    flag = `${totalFinished} topics done, zero full mocks. That's studying — not testing yourself.`;
  } else if (fullMocks != null && fullMocks !== 'not_started' && (errorLog === 'not_started' || mockAnalysis === 'not_started')) {
    flag = `You take mocks but ${errorLog === 'not_started' ? 'keep no error log' : 'skip the analysis'} — the habit that actually raises scores.`;
  } else if (arith.untouched >= 5 && hardQa.finished >= 2) {
    flag = `${hardQa.finished} hard QA chapters done, but ${arith.untouched} Arithmetic topics — QA's biggest scoring area — sit untouched.`;
  } else if (vaTouched >= 1 && rcStatus !== 'practicing' && rcStatus !== 'revising') {
    flag = `Verbal is in progress, but Reading Comprehension — two-thirds of VARC's marks — isn't.`;
  } else if (totalLearning >= 6 && totalLearning >= 2 * Math.max(1, totalFinished)) {
    flag = `${totalLearning + totalFinished} topics opened, only ${totalFinished} finished. Half-learned scores zero on exam day.`;
  } else if (heavyUntouched.length > 0) {
    const names = heavyUntouched.slice(0, 2).map((m) => m.topic).join(' and ');
    flag = `${names} — some of ${weakest.sec}'s highest-mark topics — are still untouched.`;
  } else if (weakest.learning.length > weakest.finished.length) {
    flag = `${weakest.sec}: ${weakest.learning.length} started, only ${weakest.finished.length} finished. That costs the most marks.`;
  } else {
    const strongest = [...bySection].sort((a, b) => a.gap - b.gap)[0];
    flag = `Strongest in ${strongest.sec}, thinnest in ${weakest.sec} — ${weakest.untouched.length + weakest.learning.length} topics still to go.`;
  }

  // Repeater note, second-attempt pattern only — one short clause, not a
  // second card. Cut entirely (13 Aug) when it isn't relevant; when it is,
  // it rides as one extra line under the flag, not its own bordered block.
  const repeaterLine = isRepeater && !fresh && weakest.untouched.length >= 3
    ? `Second-attempt pattern: it's concentrated in ${weakest.sec} again.`
    : null;

  return (
    <div className="space-y-4 pt-1">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500">Your first insight — free, before signup</p>
        <h1 className="mt-1 text-2xl font-bold leading-snug text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
          {fresh ? 'Here’s your starting position.' : 'We found your real gap.'}
        </h1>
      </div>

      {/* Section standing from what they JUST tapped */}
      <div className="space-y-2.5 rounded-2xl border border-stone-200 bg-stone-50 p-4">
        {bySection.map((s) => (
          <div key={s.sec} className="flex items-center gap-2">
            <span className={`w-12 shrink-0 text-xs font-bold ${s.sec === weakest.sec && !fresh ? 'text-orange-600' : 'text-stone-600'}`}>{s.sec}</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-stone-200">
              <div
                className={`h-full rounded-full ${s.sec === weakest.sec && !fresh ? 'bg-orange-500' : 'bg-emerald-500'}`}
                style={{ width: `${Math.max(3, Math.round((s.finished.length / Math.max(1, s.secEntries.length)) * 100))}%` }}
              />
            </div>
            <span className="w-14 shrink-0 text-right font-mono text-[11px] text-stone-500">{s.finished.length}/{s.secEntries.length} done</span>
          </div>
        ))}
      </div>

      {/* The red flag — one short line, plus the repeater note (if any) as a
          second line in the SAME card, not a second block. Founder, 13 Aug,
          testing his own funnel: "too much... no one even will read a
          single line." Cut to: one flag, one hook, done. */}
      <div className="flex items-start gap-2.5 rounded-2xl border-2 border-orange-300 bg-orange-50 p-4">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
        <div>
          <p className="text-sm font-medium leading-relaxed text-stone-800">{flag}</p>
          {repeaterLine && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-stone-600">
              <Target className="h-3 w-3 shrink-0" />{repeaterLine}
            </p>
          )}
        </div>
      </div>

      {/* The hook: this is what CareerRai does daily — one line, not a pitch. */}
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
