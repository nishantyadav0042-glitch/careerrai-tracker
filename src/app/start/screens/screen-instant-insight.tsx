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
  targetPercentile?: number | null;
}

const CORE_SECTIONS = ['QA', 'VARC', 'DILR'] as const;

export default function ScreenInstantInsight({ onNext, matrix, isRepeater, targetPercentile }: Props) {
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

  // The strongest true sentence available, in priority order.
  let flag: string;
  if (fresh) {
    flag = `You're starting clean — no gap yet, only open ground. The highest-mark ground: Arithmetic in QA, Reading Comprehension in VARC, Arrangements in DILR. Start where the marks are, not where the syllabus begins.`;
  } else if (inversion) {
    const names = heavyUntouched.slice(0, 3).map((m) => m.topic).join(', ');
    flag = `The ${heavyUntouched.length} high-mark ${weakest.sec} topic${heavyUntouched.length === 1 ? '' : 's'} you haven't touched — ${names} — carr${heavyUntouched.length === 1 ? 'ies' : 'y'} more mark-weight than everything you've finished in ${weakest.sec} combined. This is the gap quietly deciding your percentile.`;
  } else if (heavyUntouched.length > 0) {
    const names = heavyUntouched.slice(0, 2).map((m) => m.topic).join(' and ');
    flag = `${names} — among the highest-mark areas in ${weakest.sec} — ${heavyUntouched.length === 1 ? 'is' : 'are'} still untouched in your map. Most students discover this in their first mock. You just discovered it in 4 minutes.`;
  } else if (weakest.learning.length > weakest.finished.length) {
    flag = `Your ${weakest.sec} pattern: ${weakest.learning.length} topics opened, only ${weakest.finished.length} finished. Started-but-unfinished is the most expensive place a topic can sit — it costs time AND marks.`;
  } else {
    const strongest = [...bySection].sort((a, b) => a.gap - b.gap)[0];
    flag = `Your coverage is strongest in ${strongest.sec} and thinnest in ${weakest.sec} — ${weakest.untouched.length + weakest.learning.length} of ${weakest.secEntries.length} topics still to finish there. That imbalance is fixable, and your plan will attack it first.`;
  }

  const repeaterLine = isRepeater && !fresh && weakest.untouched.length >= 3
    ? `Repeater pattern check: your untouched list is concentrated in ${weakest.sec} — the classic second-attempt trap is rebuilding comfort zones first. Your plan won't let that happen this time.`
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

      {/* The red flag — the sentence that earns the "tagda issue" reaction */}
      <div className="flex items-start gap-2.5 rounded-2xl border-2 border-orange-300 bg-orange-50 p-4">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
        <p className="text-sm font-medium leading-relaxed text-stone-800">{flag}</p>
      </div>

      {repeaterLine && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-stone-200 bg-white p-4">
          <Target className="mt-0.5 h-4 w-4 shrink-0 text-stone-900" />
          <p className="text-sm leading-relaxed text-stone-700">{repeaterLine}</p>
        </div>
      )}

      {targetPercentile != null && !fresh && (
        <p className="px-1 text-[13px] text-stone-500">
          You said {targetPercentile}%ile. That number is decided in exactly these gaps — not in the topics you already know.
        </p>
      )}

      {/* The hook: this is what CareerRai does daily */}
      <div className="flex items-start gap-2.5 rounded-2xl border border-stone-200 bg-stone-50 p-4">
        <Bell className="mt-0.5 h-4 w-4 shrink-0 text-stone-900" />
        <p className="text-sm leading-relaxed text-stone-600">
          This took 10 seconds from your own answers. <b>CareerRai sends you one insight like this every evening</b> — your pattern, your gap, one advice — as you study. That&apos;s what you&apos;re signing up for.
        </p>
      </div>

      <button
        type="button"
        onClick={() => onNext()}
        className="w-full rounded-2xl bg-stone-900 py-4 text-sm font-semibold text-white transition-all hover:bg-stone-800 active:scale-[0.98]"
      >
        Build my plan around this →
      </button>
    </div>
  );
}
