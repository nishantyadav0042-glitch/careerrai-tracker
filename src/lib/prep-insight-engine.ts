// ── The Prep Insight Engine ──────────────────────────────────────────────────
//
// Answers one question: "Given everything this student just told us, what are
// the two or three most non-obvious, defensible things we can tell them about
// their own preparation — and what's one real thing they're doing right?"
//
// Built 13 Aug after the founder tested Instant Insight himself and rejected
// it: one branch picked one paragraph, so most students landed in the same
// few sentences regardless of their actual 53-topic map, and topic COUNT
// ("10/28 done") was the headline number when topic count means almost
// nothing in CAT — a student can finish 30 low-weight topics and still be
// exposed on the topics the paper actually asks.
//
// Same discipline as every other engine in this codebase (topic-selector,
// mission-engine, study-pace): every signal is a pure function over data the
// student actually gave us, every number traces back to a real tap, and a
// detector either fires for a stated reason or it doesn't fire at all. No ML,
// no invented weights, nothing that looks like a percentile promise —
// TRUST-OS forbids exactly that class of claim.
//
// ARCHITECTURE: up to ~15 detectors run internally. The student never sees
// that number — they see the 3 that matter most for THEM. Each detector
// carries two independent scores:
//   severity   — how big a deal is this, if true
//   confidence — how sure are we it's actually happening (not every pattern
//                is provable the way "you're behind on hours" is provable)
// A prerequisite gap read straight off the topic graph is confidence 9; a
// "comfort zone" inference from a difficulty skew is confidence 6 — real
// signal, but an inference, and the copy says so by describing the PATTERN,
// never diagnosing the student's psychology.
//
// The 3-card shape is fixed, not incidental: position 1 (biggest finding),
// position 2 (a second pattern), position 3 (a REAL strength, always
// present — a screen that's all red reads as scare tactics, not a mirror).

import { TOPIC_METADATA, type TopicMetadata } from './topics-constants';
import { remainingSyllabusHours, studentEffortMultiplier, computeRequiredPace, type TopicStatusRow } from './study-pace';

export type CoverageStatus = 'not_started' | 'learning' | 'practicing' | 'revising';
export interface MatrixEntry { section: string; topic: string; status: CoverageStatus }

export type SignalPolarity = 'risk' | 'pattern' | 'strength';

export interface PrepSignal {
  key: string;
  polarity: SignalPolarity;
  severity: number;   // 0-10 — how big a deal, if true
  confidence: number; // 0-10 — how sure we are it's real, not inferred noise
  headline: string;   // one bold line — the WHAT
  stats?: string[];   // 0-3 short evidence lines — the WHY, numbers only, no prose
  note?: string;      // one optional short line — the SO-WHAT / NOW-WHAT
  recommend: string;  // 3-6 words, feeds the closing synthesis line
}

export interface PrepInsightInput {
  matrix: MatrixEntry[] | null;
  /** ISO date, the syllabus finish date the student committed to (NOT the exam date). */
  ambitionDate: string | null;
  /** Self-study hours/day. Null when not yet collected at this point in the flow. */
  selfStudyHours: number | null;
  isRepeater: boolean | null;
  lastYearPercentile: number | null;
  today: Date;
}

export interface WeightedCoverage {
  donePct: number;
  inProgressPct: number;
  untouchedPct: number;
}

export interface PrepInsightResult {
  /** True when the student has tapped nothing at all — a different, much shorter screen. */
  fresh: boolean;
  weightedCoverage: WeightedCoverage;
  /** Always length 3 once `fresh` is false: [biggest finding, second pattern, real strength]. */
  cards: PrepSignal[];
  /** One short line synthesised from the top 2 non-strength cards' `recommend`. */
  synthesis: string | null;
}

const CORE_SECTIONS = ['QA', 'VARC', 'DILR'] as const;
type CoreSection = (typeof CORE_SECTIONS)[number];
const TIE_ORDER: Record<CoreSection, number> = { DILR: 0, QA: 1, VARC: 2 };

interface SectionStats {
  sec: CoreSection;
  entries: { topic: string; status: CoverageStatus; meta: TopicMetadata }[];
  finished: { topic: string; status: CoverageStatus; meta: TopicMetadata }[];
  learning: { topic: string; status: CoverageStatus; meta: TopicMetadata }[];
  untouched: { topic: string; status: CoverageStatus; meta: TopicMetadata }[];
  weightTotal: number;
  weightDone: number;
  weightLearning: number;
  weightUntouched: number;
  /** 0-1, higher = weaker. Weight-based, not count-based — a section with one
   *  huge untouched topic can outweigh a section with three small ones. */
  gap: number;
}

const isFinished = (s: CoverageStatus) => s === 'practicing' || s === 'revising';

function sumWeight(rows: { meta: TopicMetadata }[]): number {
  return rows.reduce((s, r) => s + r.meta.weightage, 0);
}

function buildSectionStats(matrix: MatrixEntry[]): SectionStats[] {
  const withMeta = matrix
    .map((m) => ({ topic: m.topic, status: m.status, meta: TOPIC_METADATA[m.topic] }))
    .filter((m): m is { topic: string; status: CoverageStatus; meta: TopicMetadata } => !!m.meta);

  return CORE_SECTIONS.map((sec) => {
    const entries = withMeta.filter((m) => m.meta.section === sec);
    const finished = entries.filter((m) => isFinished(m.status));
    const learning = entries.filter((m) => m.status === 'learning');
    const untouched = entries.filter((m) => m.status === 'not_started');
    const weightTotal = sumWeight(entries);
    const weightDone = sumWeight(finished);
    const weightLearning = sumWeight(learning);
    const weightUntouched = sumWeight(untouched);
    const gap = weightTotal > 0 ? (weightUntouched * 2 + weightLearning) / (weightTotal * 2) : 0;
    return { sec, entries, finished, learning, untouched, weightTotal, weightDone, weightLearning, weightUntouched, gap };
  });
}

// ── Clusters reused from the original branch logic — same topic lists, now
// consumed by named detectors instead of one long if/else. ──────────────────
const ARITHMETIC = ['Percentages', 'Profit & Loss', 'Ratio & Proportion', 'Average', 'Mixtures', 'Time & Work', 'Pipes & Cisterns', 'Time Speed Distance', 'SI & CI'];
const HARD_QA = ['Linear Equations', 'Quadratic Equations', 'Functions', 'Inequalities', 'Logarithms', 'Progressions', 'Divisibility', 'HCF & LCM', 'Remainders', 'Base System', 'Lines & Angles', 'Triangles', 'Quadrilaterals', 'Circles', 'Mensuration', 'Coordinate Geometry'];
const VERBAL_SMALL = ['Para Jumbles', 'Para Summary', 'Odd One Out', 'Para Completion', 'Vocabulary'];

function statusOf(matrix: MatrixEntry[], topic: string): CoverageStatus | null {
  return matrix.find((m) => m.topic === topic)?.status ?? null;
}
function clusterCounts(matrix: MatrixEntry[], units: string[]): { finished: number; untouched: number; total: number } {
  const rows = units.map((t) => statusOf(matrix, t)).filter((s): s is CoverageStatus => s != null);
  return {
    finished: rows.filter(isFinished).length,
    untouched: rows.filter((s) => s === 'not_started').length,
    total: rows.length,
  };
}

// ── Detector pool ────────────────────────────────────────────────────────────
// Each returns null when it doesn't apply. score = severity * confidence,
// used only for ranking — never shown to the student.

interface Ctx {
  matrix: MatrixEntry[];
  bySection: SectionStats[];
  weakest: SectionStats;
  strongest: SectionStats;
  totalFinished: number;
  totalLearning: number;
  weightTotalAll: number;
  weightDoneAll: number;
  weightLearningAll: number;
  weightUntouchedAll: number;
  isRepeater: boolean | null;
  pace: ReturnType<typeof computeRequiredPace> | null;
  remainingHours: number;
}

type Detector = (ctx: Ctx) => PrepSignal | null;

const detectDateArithmetic: Detector = (ctx) => {
  const { pace, remainingHours } = ctx;
  if (!pace) return null;
  const availableHours = Math.round((pace.committedPerDay ?? 0) * pace.daysLeft);
  if (pace.status === 'unrealistic' || pace.status === 'behind') {
    const shortfall = Math.max(1, Math.round(remainingHours - availableHours));
    return {
      key: 'date-arithmetic', polarity: 'risk', severity: pace.status === 'unrealistic' ? 10 : 8, confidence: 10,
      headline: `Your target date doesn't survive the arithmetic.`,
      stats: [
        `~${Math.round(remainingHours)}h estimated study left`,
        `~${availableHours}h available by your date`,
        `≈${shortfall}h short`,
      ],
      recommend: `add ~${pace.catchUpPerDay}h/day or move the date`,
    };
  }
  return null;
};

// Ahead-of-pace is the strength version of the same arithmetic — same
// numbers, opposite framing. Kept as a separate detector rather than a flag
// on the risk one so it competes cleanly in the strength pool.
const detectAheadOfPace: Detector = (ctx) => {
  const { pace, remainingHours } = ctx;
  if (!pace || pace.status !== 'ahead') return null;
  const availableHours = Math.round((pace.committedPerDay ?? 0) * pace.daysLeft);
  return {
    key: 'ahead-of-pace', polarity: 'strength', severity: 6, confidence: 10,
    headline: `You have more time than your syllabus currently needs.`,
    stats: [`~${Math.round(remainingHours)}h estimated study left`, `~${availableHours}h available by your date`, `~${pace.aheadPerDay}h/day to spare`],
    recommend: 'use the spare time on mocks',
  };
};

const detectOnPace: Detector = (ctx) => {
  const { pace } = ctx;
  if (!pace || pace.status !== 'on_pace') return null;
  return {
    key: 'on-pace', polarity: 'strength', severity: 4, confidence: 9,
    headline: `You're exactly on pace for your own date.`,
    stats: [`~${pace.requiredPerDay}h/day needed, ~${pace.committedPerDay}h/day committed`],
    recommend: 'stay consistent, nothing to fix here',
  };
};

// Deterministic off the topic graph itself — the highest-confidence pattern
// detector in the set, because it isn't an inference about the student, it's
// a fact about the order they worked in.
const detectPrerequisiteGap: Detector = (ctx) => {
  const violations: { topic: string; prereq: string; status: CoverageStatus; weight: number }[] = [];
  for (const s of ctx.bySection) {
    for (const e of [...s.learning, ...s.finished]) {
      for (const prereq of e.meta.prerequisites) {
        const prereqStatus = statusOf(ctx.matrix, prereq);
        if (prereqStatus == null || prereqStatus === 'not_started') {
          violations.push({ topic: e.topic, prereq, status: e.status, weight: e.meta.weightage });
        }
      }
    }
  }
  if (violations.length === 0) return null;
  violations.sort((a, b) => b.weight - a.weight);
  const top = violations[0];
  return {
    key: 'prereq-gap', polarity: 'risk', severity: 8, confidence: 9,
    headline: `You're ${top.status === 'learning' ? 'learning' : 'practising'} ${top.topic} before its foundation.`,
    stats: [`${top.topic} → ${top.status}`, `${top.prereq} (needed first) → not started`],
    note: 'Fix the foundation before pushing this further.',
    recommend: `finish ${top.prereq} before more ${top.topic}`,
  };
};

const detectNoPrereqGaps: Detector = (ctx) => {
  const hasProgress = ctx.totalFinished + ctx.totalLearning >= 5;
  if (!hasProgress) return null;
  const anyViolation = ctx.bySection.some((s) =>
    [...s.learning, ...s.finished].some((e) => e.meta.prerequisites.some((p) => {
      const st = statusOf(ctx.matrix, p);
      return st == null || st === 'not_started';
    }))
  );
  if (anyViolation) return null;
  return {
    key: 'sequencing-clean', polarity: 'strength', severity: 4, confidence: 7,
    headline: `You're building in the right order.`,
    stats: [`no foundation gaps in what you've started`],
    recommend: 'keep following the natural sequence',
  };
};

// The weighted version of "you're prepping the wrong half" — untouched
// high-mark topics in the weakest section outweigh what's actually finished.
const detectWeightedInversion: Detector = (ctx) => {
  const { weakest } = ctx;
  const heavyUntouched = weakest.untouched.filter((e) => e.meta.weightage >= 4).sort((a, b) => b.meta.weightage - a.meta.weightage);
  if (heavyUntouched.length === 0 || weakest.finished.length === 0) return null;
  const untouchedWeight = sumWeight(heavyUntouched);
  if (untouchedWeight <= weakest.weightDone) return null;
  const names = heavyUntouched.slice(0, 2).map((e) => e.topic).join(' and ');
  return {
    key: 'weighted-inversion', polarity: 'risk', severity: 7, confidence: 8,
    headline: `${names} carr${heavyUntouched.length === 1 ? 'ies' : 'y'} more marks than everything you've finished in ${weakest.sec}.`,
    stats: [`untouched high-mark: ${untouchedWeight} pts`, `finished in ${weakest.sec}: ${weakest.weightDone} pts`],
    recommend: `start ${heavyUntouched[0].topic} next`,
  };
};

const detectHalfOpenPile: Detector = (ctx) => {
  const { totalLearning, totalFinished } = ctx;
  if (totalLearning < 6 || totalLearning < 2 * Math.max(1, totalFinished)) return null;
  return {
    key: 'half-open', polarity: 'pattern', severity: 6, confidence: 7,
    headline: `${totalLearning + totalFinished} topics opened, only ${totalFinished} finished.`,
    stats: [`half-learned scores zero on exam day`],
    recommend: 'close open topics before starting new ones',
  };
};

const detectMockNoErrorLog: Detector = (ctx) => {
  const fullMocks = statusOf(ctx.matrix, 'Full Length Mocks');
  const errorLog = statusOf(ctx.matrix, 'Error Log');
  const mockAnalysis = statusOf(ctx.matrix, 'Mock Analysis');
  if (fullMocks == null || fullMocks === 'not_started') return null;
  if (errorLog != null && errorLog !== 'not_started' && mockAnalysis != null && mockAnalysis !== 'not_started') return null;
  const missing = errorLog === 'not_started' || errorLog == null ? 'keep no error log' : 'skip the analysis';
  return {
    key: 'mock-no-log', polarity: 'risk', severity: 7, confidence: 9,
    headline: `You take mocks but ${missing}.`,
    note: 'The same mistakes repeat on the next one without it.',
    recommend: 'start an error log from your next mock',
  };
};

const detectGoodMockHygiene: Detector = (ctx) => {
  const fullMocks = statusOf(ctx.matrix, 'Full Length Mocks');
  const errorLog = statusOf(ctx.matrix, 'Error Log');
  const mockAnalysis = statusOf(ctx.matrix, 'Mock Analysis');
  const active = (s: CoverageStatus | null) => s != null && s !== 'not_started';
  if (!active(fullMocks) || !active(errorLog) || !active(mockAnalysis)) return null;
  return {
    key: 'good-mock-hygiene', polarity: 'strength', severity: 5, confidence: 8,
    headline: `You're already testing yourself properly.`,
    stats: [`mocks + error log + analysis — all active`],
    recommend: 'keep the mock-analysis-log loop weekly',
  };
};

const detectNeverMocked: Detector = (ctx) => {
  const fullMocks = statusOf(ctx.matrix, 'Full Length Mocks');
  if (ctx.totalFinished < 8) return null;
  if (fullMocks != null && fullMocks !== 'not_started') return null;
  return {
    key: 'never-mocked', polarity: 'pattern', severity: 6, confidence: 8,
    headline: `${ctx.totalFinished} topics done, zero full mocks.`,
    note: `That's studying — not testing yourself.`,
    recommend: 'take one full mock this week',
  };
};

const detectReadingHabitGap: Detector = (ctx) => {
  const vaTouched = VERBAL_SMALL.filter((t) => {
    const s = statusOf(ctx.matrix, t);
    return s != null && s !== 'not_started';
  }).length;
  const rc = statusOf(ctx.matrix, 'Reading Comprehension');
  if (vaTouched < 1 || (rc != null && isFinished(rc))) return null;
  return {
    key: 'reading-gap', polarity: 'pattern', severity: 5, confidence: 6,
    headline: `Verbal is moving, but Reading Comprehension isn't.`,
    stats: [`RC is roughly two-thirds of VARC's marks`],
    recommend: 'bring Reading Comprehension into practice',
  };
};

const detectCoachingSequenceTrap: Detector = (ctx) => {
  const arith = clusterCounts(ctx.matrix, ARITHMETIC);
  const hard = clusterCounts(ctx.matrix, HARD_QA);
  if (arith.untouched < 5 || hard.finished < 2) return null;
  return {
    key: 'coaching-trap', polarity: 'pattern', severity: 5, confidence: 6,
    headline: `${hard.finished} hard QA chapters done, but ${arith.untouched} Arithmetic topics sit untouched.`,
    note: `Arithmetic is QA's single biggest scoring block.`,
    recommend: 'start Arithmetic next',
  };
};

// Difficulty skew — an inference, not a fact, so confidence is deliberately
// lower than the graph-based detectors. Describes the pattern, never
// diagnoses the student ("you're avoiding X" would be psychoanalysis).
const detectDifficultySkew: Detector = (ctx) => {
  const all = ctx.bySection.flatMap((s) => s.entries);
  const finished = all.filter((e) => isFinished(e.status));
  const untouched = all.filter((e) => e.status === 'not_started');
  if (finished.length < 3 || untouched.length < 3) return null;
  const avg = (rows: typeof finished) => rows.reduce((s, r) => s + r.meta.difficulty, 0) / rows.length;
  const finishedAvg = avg(finished);
  const untouchedAvg = avg(untouched);
  if (untouchedAvg - finishedAvg < 1.0) return null;
  return {
    key: 'difficulty-skew', polarity: 'pattern', severity: 5, confidence: 6,
    headline: `Most of what you've finished is on the easier side.`,
    stats: [`finished avg difficulty ${finishedAvg.toFixed(1)}`, `untouched avg difficulty ${untouchedAvg.toFixed(1)}`],
    recommend: 'move into harder topics next',
  };
};

const detectSectionImbalance: Detector = (ctx) => {
  const { strongest, weakest } = ctx;
  if (strongest.sec === weakest.sec) return null;
  const strongPct = strongest.weightTotal > 0 ? Math.round((strongest.weightDone / strongest.weightTotal) * 100) : 0;
  const weakPct = weakest.weightTotal > 0 ? Math.round((weakest.weightDone / weakest.weightTotal) * 100) : 0;
  if (strongPct - weakPct < 25) return null;
  return {
    key: 'section-imbalance', polarity: 'pattern', severity: 5, confidence: 6,
    headline: `You're progressing unevenly across sections.`,
    stats: [`${strongest.sec} ${strongPct}%`, `${weakest.sec} ${weakPct}%`],
    recommend: `put your next hours into ${weakest.sec}`,
  };
};

// Repeater-specific — behavioural, not outcome-predictive. Deliberately does
// NOT say "again" or reference last year's actual gaps: we have last year's
// PERCENTILE, not last year's topic map, so any claim about repeating a
// specific pattern from last year would be invented, not observed.
const detectRepeaterConcentration: Detector = (ctx) => {
  if (!ctx.isRepeater) return null;
  const { weakest } = ctx;
  const untouchedShare = weakest.weightTotal > 0 ? weakest.weightUntouched / weakest.weightTotal : 0;
  if (untouchedShare < 0.4) return null;
  return {
    key: 'repeater-concentration', polarity: 'pattern', severity: 5, confidence: 6,
    headline: `As a repeater, your untouched topics are concentrated in ${weakest.sec}.`,
    note: `That's where the plan will focus first.`,
    recommend: `prioritise ${weakest.sec} early`,
  };
};

const detectStrongestSection: Detector = (ctx) => {
  const { strongest } = ctx;
  if (strongest.weightTotal === 0) return null;
  const pct = Math.round((strongest.weightDone / strongest.weightTotal) * 100);
  if (pct < 40) return null; // only brag when it's actually true
  return {
    key: 'strongest-section', polarity: 'strength', severity: pct >= 55 ? 6 : 4, confidence: 8,
    headline: `${strongest.sec} is your strongest section so far.`,
    stats: [`~${pct}% weighted coverage`],
    recommend: `protect ${strongest.sec} — don't restart it`,
  };
};

// ── The early-stage floor ────────────────────────────────────────────────
//
// A student who's tapped only 1-2 topics gives almost every detector above
// too little signal to fire honestly — and that's correct, not a bug: this
// codebase's rule is a detector fires for a stated reason or not at all, and
// "you're behind on hours" from two touched topics would be exactly the
// manufactured-problem the founder rejected outright ("don't manufacture a
// problem" — his own words, on the headline-severity question). These two
// are the honest things left to say at that stage: real, low-stakes,
// genuinely always computable, and naturally outranked (low severity) the
// moment anything sharper has enough data to fire.

const detectUntouchedSection: Detector = (ctx) => {
  const wideOpen = ctx.bySection.find((s) => s.weightTotal > 0 && s.weightDone === 0 && s.weightLearning === 0);
  if (!wideOpen) return null;
  return {
    key: 'untouched-section', polarity: 'pattern', severity: 3, confidence: 10,
    headline: `${wideOpen.sec} is completely untouched so far.`,
    recommend: `open ${wideOpen.sec} next`,
  };
};

const detectStartedSomewhere: Detector = (ctx) => {
  if (ctx.totalFinished + ctx.totalLearning === 0) return null;
  const busiest = [...ctx.bySection].sort((a, b) => (b.finished.length + b.learning.length) - (a.finished.length + a.learning.length))[0];
  if (busiest.finished.length + busiest.learning.length === 0) return null;
  return {
    key: 'started-somewhere', polarity: 'pattern', severity: 2, confidence: 6,
    headline: `Most of your effort so far is in ${busiest.sec}.`,
    recommend: `keep building ${busiest.sec}, then branch out`,
  };
};

// The guaranteed floor. Always fires (ctx is unused — same Detector shape as
// every other entry, on purpose: a bespoke zero-arg signature here would
// erase call-site arity checking the moment it's annotated as `Detector`,
// which is exactly the kind of silent-type-hole this codebase's engines
// don't allow). Always true, never invented: mapping all 53 topics in
// detail is real behaviour most students never do.
const detectMappedEverything: Detector = (): PrepSignal => ({
  key: 'mapped-everything', polarity: 'strength', severity: 2, confidence: 10,
  headline: `You just mapped all 53 topics in detail.`,
  note: `Most students never break their prep down this precisely.`,
  recommend: 'let the plan use this instead of starting blind',
});

const RISK_PATTERN_DETECTORS: Detector[] = [
  detectDateArithmetic, detectPrerequisiteGap, detectWeightedInversion, detectHalfOpenPile,
  detectMockNoErrorLog, detectNeverMocked, detectReadingHabitGap, detectCoachingSequenceTrap,
  detectDifficultySkew, detectSectionImbalance, detectRepeaterConcentration,
  // Early-stage floor — deliberately last: lowest severity*confidence of the
  // pool, so anything sharper above always outranks them once it has data.
  detectUntouchedSection, detectStartedSomewhere,
];
// detectMappedEverything is last and unconditional — this array (unlike
// RISK_PATTERN_DETECTORS) can never produce zero results.
const STRENGTH_DETECTORS: Detector[] = [
  detectAheadOfPace, detectOnPace, detectNoPrereqGaps, detectGoodMockHygiene, detectStrongestSection,
  detectMappedEverything,
];

function score(sig: PrepSignal): number {
  return sig.severity * sig.confidence;
}

export function computePrepInsight(input: PrepInsightInput): PrepInsightResult {
  const matrix = (input.matrix ?? []).filter((m) => TOPIC_METADATA[m.topic]);
  const fresh = matrix.length === 0 || matrix.every((m) => m.status === 'not_started');

  const bySection = buildSectionStats(matrix);
  const weightTotalAll = bySection.reduce((s, x) => s + x.weightTotal, 0);
  const weightDoneAll = bySection.reduce((s, x) => s + x.weightDone, 0);
  const weightLearningAll = bySection.reduce((s, x) => s + x.weightLearning, 0);
  const weightUntouchedAll = bySection.reduce((s, x) => s + x.weightUntouched, 0);

  const weightedCoverage: WeightedCoverage = weightTotalAll > 0
    ? {
        donePct: Math.round((weightDoneAll / weightTotalAll) * 100),
        inProgressPct: Math.round((weightLearningAll / weightTotalAll) * 100),
        untouchedPct: Math.round((weightUntouchedAll / weightTotalAll) * 100),
      }
    : { donePct: 0, inProgressPct: 0, untouchedPct: 100 };

  if (fresh) {
    return { fresh: true, weightedCoverage, cards: [], synthesis: null };
  }

  const sorted = [...bySection].sort((a, b) => b.gap - a.gap || TIE_ORDER[a.sec] - TIE_ORDER[b.sec]);
  const weakest = sorted[0];
  const strongest = sorted[sorted.length - 1];

  const rows: TopicStatusRow[] = matrix.map((m) => ({ topic: m.topic, status: m.status }));
  const effort = studentEffortMultiplier({ isRepeater: input.isRepeater, lastYearPercentile: input.lastYearPercentile });
  const remainingHours = remainingSyllabusHours(rows, effort);
  const pace = input.ambitionDate && input.selfStudyHours != null
    ? computeRequiredPace({
        remainingHours, today: input.today, targetDate: new Date(input.ambitionDate),
        committedPerDay: input.selfStudyHours,
      })
    : null;

  const ctx: Ctx = {
    matrix, bySection, weakest, strongest,
    totalFinished: bySection.reduce((s, x) => s + x.finished.length, 0),
    totalLearning: bySection.reduce((s, x) => s + x.learning.length, 0),
    weightTotalAll, weightDoneAll, weightLearningAll, weightUntouchedAll,
    isRepeater: input.isRepeater, pace, remainingHours,
  };

  const riskPattern = RISK_PATTERN_DETECTORS.map((d) => d(ctx)).filter((s): s is PrepSignal => s != null)
    .sort((a, b) => score(b) - score(a));

  // detectMappedEverything (last in STRENGTH_DETECTORS) is unconditional, so
  // this pool can never come back empty.
  const strengths = STRENGTH_DETECTORS.map((d) => d(ctx)).filter((s): s is PrepSignal => s != null)
    .sort((a, b) => score(b) - score(a));
  const bestStrength = strengths[0];

  // Positions 1-2: risk/pattern findings, ranked. Structurally guaranteed to
  // reach 2 (not just usually) by falling back to the next-best strength
  // when the risk/pattern pool runs dry — the early-stage floor detectors
  // above mean that's rare, but the guarantee holds even if it happens.
  const top2 = riskPattern.slice(0, 2);
  if (top2.length < 2) {
    for (const s of strengths.slice(1)) {
      if (top2.length >= 2) break;
      top2.push(s);
    }
  }
  const cards = [...top2, bestStrength];

  const nonStrength = top2.filter((c) => c.polarity !== 'strength');
  const synthesis = nonStrength.length > 0
    ? nonStrength.map((c) => c.recommend).join(' — then ')
    : null;

  return { fresh: false, weightedCoverage, cards, synthesis };
}
