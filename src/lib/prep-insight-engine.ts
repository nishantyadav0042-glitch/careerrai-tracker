// ── The Prep Insight Engine ──────────────────────────────────────────────────
//
// Answers one question: after a student gives us ~60 onboarding inputs, what
// are the 1-3 things about their preparation that are specific, defensible,
// AND non-obvious enough that they think "this app actually understood me"?
//
// ── Why v2 exists (13 Aug adversarial audit) ─────────────────────────────────
//
// v1 replaced a single if/else paragraph with 15 detectors ranked by
// severity × confidence. It made the output technically differentiated but
// pedagogically shallow: 25 adversarial profiles produced only 4 genuinely
// insightful cards. Three root problems, all fixed here:
//
//   FALSE MATHEMATICS. v1 summed `weightage` across QA+DILR+VARC into one
//   137-point denominator and called the result "% of the paper's marks".
//   The metadata defines weightage as "relative emphasis within its OWN
//   section, 1-5" and explicitly warns it is "editable content… NOT measured
//   data… never a cited fact." The summed pool was 59% QA / 23% DILR / 18%
//   VARC — a fabricated distribution. Weighting is now ONLY ever used within
//   a section, which is what the field actually means, and the word "marks"
//   appears nowhere in student-facing copy.
//
//   CERTAINTY MISTAKEN FOR INSIGHT. Ranking on severity × confidence alone
//   rewarded restatement: "VARC is completely untouched" scored high purely
//   because it is certain — but the student tapped it twenty seconds ago.
//   Every signal now carries `nonObvious`, and ranking discounts anything
//   the student could read off their own answers.
//
//   CORRELATED CARDS. "QA is your strongest" + "progressing unevenly, QA
//   100% / DILR 0%" are one finding rendered twice. Every signal now
//   declares a `rootCause`, and at most ONE card per root cause survives.
//
// ── Standing rules ───────────────────────────────────────────────────────────
//
// Same discipline as topic-selector / mission-engine / study-pace: pure
// functions, every number traceable to a real student tap or to reviewed
// metadata, a detector fires for a stated reason or not at all. No ML, no
// invented weights, and — per TRUST-OS — no score, percentile, or outcome
// prediction anywhere.
//
// No card quota. If the evidence supports two findings, the student sees
// two. If a student has barely started, the honest answer is that we don't
// have enough history to name a weakness yet — which builds more trust than
// dressing up "VARC is untouched" as a discovery.

import { TOPIC_METADATA, type TopicMetadata } from './topics-constants';
import { remainingSyllabusHours, studentEffortMultiplier, computeRequiredPace, type TopicStatusRow } from './study-pace';
import { isCovered, statusRank, type CoverageStatus } from './coverage-status';

// CoverageStatus is RE-EXPORTED from the module that owns the ladder, never
// re-declared. This file used to declare its own copy — same exported name,
// same four first rungs, exam_ready missing — so any file importing
// `CoverageStatus` from here got a silently narrower type than the canonical
// one, under a name that gave no hint of it.
export type { CoverageStatus };
export interface MatrixEntry { section: string; topic: string; status: CoverageStatus }

export type SignalPolarity = 'risk' | 'pattern' | 'strength';

/**
 * The layer above detectors. Several detectors can describe one underlying
 * problem; only the strongest card per root cause reaches the student, so
 * they never read three statistical descriptions of the same issue.
 */
export type RootCause =
  | 'timeline'
  | 'foundation'
  | 'imbalance'
  | 'high_value_neglect'
  | 'unfinished'
  | 'difficulty'
  | 'mock_readiness';

export interface PrepSignal {
  key: string;
  rootCause: RootCause;
  polarity: SignalPolarity;
  /** 0-10 — how materially this affects the student's preparation. */
  severity: number;
  /** 0-10 — how strongly the conclusion is supported by the evidence. */
  confidence: number;
  /**
   * 0-10 — could the student have learned this by looking at the answers
   * they just entered? 1 = pure restatement of their own taps; 9-10 =
   * requires traversing a graph or combining several inputs they never
   * connected. This is what separates insight from a mirror.
   */
  nonObvious: number;
  /**
   * The CONSEQUENCE, not the count. This is the one line the student
   * remembers, so it states what their data MEANS — "You're collecting
   * topics, not finishing them" — never what it says: "14 opened, 1
   * finished". The facts belong in `stats` directly underneath, where they
   * prove the headline instead of being the headline.
   */
  headline: string;
  /** The numbers that prove the headline. Numbers, never prose. */
  stats?: string[];
  /**
   * The recognition line — names a feeling the student already has, so the
   * card lands as "that's exactly what's happening to me" rather than as a
   * statistic. The strongest single sentence on any card.
   */
  note?: string;
  /** What CareerRai will actually do about it. Concrete, always achievable. */
  action?: string;
  /** 3-6 words, feeds the closing synthesis line. */
  recommend: string;
}

export interface SectionCoverage {
  sec: CoreSection;
  /** Weighted WITHIN this section only — the metadata's actual semantics. */
  donePct: number;
  inProgressPct: number;
  finishedCount: number;
  totalCount: number;
}

export interface PrepInsightInput {
  matrix: MatrixEntry[] | null;
  /** ISO date: the syllabus finish date the student chose (NOT the exam date). */
  ambitionDate: string | null;
  /** Self-study hours/day. Null when not yet collected at this point in the flow. */
  selfStudyHours: number | null;
  isRepeater: boolean | null;
  lastYearPercentile: number | null;
  today: Date;
}

export type InsightState = 'insufficient_evidence' | 'diagnosed';

export interface StartingPoint { sec: CoreSection; topic: string }

export interface PrepInsightResult {
  state: InsightState;
  /** Per-section, weighted within section. Never summed across sections. */
  sectionCoverage: SectionCoverage[];
  /** 0-2 earned findings. No quota, no filler. */
  cards: PrepSignal[];
  /** Only when genuinely earned — never manufactured for positive sentiment. */
  strength: PrepSignal | null;
  /** For the insufficient-evidence state: where to actually begin. */
  startingPoints: StartingPoint[];
  synthesis: string | null;
}

const CORE_SECTIONS = ['QA', 'VARC', 'DILR'] as const;
export type CoreSection = (typeof CORE_SECTIONS)[number];
const TIE_ORDER: Record<CoreSection, number> = { DILR: 0, QA: 1, VARC: 2 };

type Row = { topic: string; status: CoverageStatus; meta: TopicMetadata };

interface SectionStats {
  sec: CoreSection;
  entries: Row[];
  finished: Row[];   // practicing | revising
  mastered: Row[];   // revising only — the real mastery signal
  learning: Row[];
  untouched: Row[];
  weightTotal: number;
  weightDone: number;
  weightLearning: number;
  weightUntouched: number;
  /** 0-1 within this section, higher = weaker. */
  gap: number;
}

// Was `s === 'practicing' || s === 'revising'` — the one implementation of
// this question out of eleven that dropped exam_ready, so a topic the student
// EARNED through evidence read as never studied. Latent rather than live (this
// engine's matrix is self-reported and exam_ready cannot be self-assigned), and
// latent is exactly why it survived: a rule that is wrong only where it is not
// yet used never produces a bug report.
const isFinished = (s: CoverageStatus) => isCovered(s);
const sumWeight = (rows: Row[]) => rows.reduce((s, r) => s + r.meta.weightage, 0);

function buildSectionStats(matrix: MatrixEntry[]): SectionStats[] {
  const withMeta: Row[] = matrix
    .map((m) => ({ topic: m.topic, status: m.status, meta: TOPIC_METADATA[m.topic] }))
    .filter((m): m is Row => !!m.meta);

  return CORE_SECTIONS.map((sec) => {
    const entries = withMeta.filter((m) => m.meta.section === sec);
    const finished = entries.filter((m) => isFinished(m.status));
    const mastered = entries.filter((m) => m.status === 'revising');
    const learning = entries.filter((m) => m.status === 'learning');
    const untouched = entries.filter((m) => m.status === 'not_started');
    const weightTotal = sumWeight(entries);
    const weightDone = sumWeight(finished);
    const weightLearning = sumWeight(learning);
    const weightUntouched = sumWeight(untouched);
    const gap = weightTotal > 0 ? (weightUntouched * 2 + weightLearning) / (weightTotal * 2) : 0;
    return { sec, entries, finished, mastered, learning, untouched, weightTotal, weightDone, weightLearning, weightUntouched, gap };
  });
}

const ARITHMETIC = ['Percentages', 'Profit & Loss', 'Ratio & Proportion', 'Average', 'Mixtures', 'Time & Work', 'Pipes & Cisterns', 'Time Speed Distance', 'SI & CI'];
const HARD_QA = ['Linear Equations', 'Quadratic Equations', 'Functions', 'Inequalities', 'Logarithms', 'Progressions', 'Divisibility', 'HCF & LCM', 'Remainders', 'Base System', 'Lines & Angles', 'Triangles', 'Quadrilaterals', 'Circles', 'Mensuration', 'Coordinate Geometry'];
const VERBAL_SMALL = ['Para Jumbles', 'Para Summary', 'Odd One Out', 'Sentence Completion', 'Vocabulary'];

function statusOf(matrix: MatrixEntry[], topic: string): CoverageStatus | null {
  return matrix.find((m) => m.topic === topic)?.status ?? null;
}
function clusterCounts(matrix: MatrixEntry[], units: string[]) {
  const rows = units.map((t) => statusOf(matrix, t)).filter((s): s is CoverageStatus => s != null);
  return {
    finished: rows.filter(isFinished).length,
    untouched: rows.filter((s) => s === 'not_started').length,
    total: rows.length,
  };
}

// ── Prerequisite root-cause traversal ────────────────────────────────────────
//
// The audit's P0-4: v1 reported whichever violated prerequisite had the
// highest weightage, which for a chain C → B → A could name the middle link.
// That tells a student nothing actionable — the thing blocking them is the
// DEEPEST unmet foundation, not the nearest one.
//
// "Unmet" means not_started only. The metadata is explicit that a
// prerequisite "should be at least 'started'", so a prerequisite sitting at
// learning/practicing/revising is legitimately satisfied and must not be
// reported as missing.
//
// Cycle-safe by construction: `seen` guards the descent, so malformed
// metadata with a circular edge terminates instead of blowing the stack.

interface FoundationGap { topic: string; status: CoverageStatus; root: string; depth: number }

function deepestUnmetPrereq(matrix: MatrixEntry[], topic: string, seen: Set<string>, depth: number): { root: string; depth: number } | null {
  if (seen.has(topic)) return null;
  seen.add(topic);
  const meta = TOPIC_METADATA[topic];
  if (!meta) return null;

  let best: { root: string; depth: number } | null = null;
  for (const prereq of meta.prerequisites) {
    if (!TOPIC_METADATA[prereq]) continue; // missing metadata — skip, never guess
    const status = statusOf(matrix, prereq);
    const unmet = status == null || status === 'not_started';

    // Descend first: a deeper unmet ancestor outranks this one.
    const deeper = deepestUnmetPrereq(matrix, prereq, seen, depth + 1);
    if (deeper && (!best || deeper.depth > best.depth)) best = deeper;
    if (unmet && (!best || depth + 1 > best.depth)) {
      best = { root: prereq, depth: depth + 1 };
    }
  }
  return best;
}

function findFoundationGap(bySection: SectionStats[], matrix: MatrixEntry[]): FoundationGap | null {
  const candidates: FoundationGap[] = [];
  for (const s of bySection) {
    // Only topics the student is ACTIVELY working on can be "built on sand".
    for (const e of [...s.finished, ...s.learning]) {
      const found = deepestUnmetPrereq(matrix, e.topic, new Set(), 0);
      if (found) candidates.push({ topic: e.topic, status: e.status, root: found.root, depth: found.depth });
    }
  }
  if (candidates.length === 0) return null;
  // Most-advanced topic first, then deepest chain — that combination is the
  // most surprising and the most actionable.
  // Ranks by the canonical ladder rather than a hand-numbered copy of it, so
  // exam_ready sorts above revising instead of falling into the `: 1` bucket
  // with not_started.
  const rank = (c: FoundationGap) => Math.max(statusRank(c.status), 1) * 10 + c.depth;
  return candidates.sort((a, b) => rank(b) - rank(a))[0];
}

// ── Timeline ────────────────────────────────────────────────────────────────
//
// P0-3: v1 could print "add ~390h/day" and treated a date already in the past
// as an ordinary pace problem. Both destroy trust instantly. The arithmetic
// still comes from study-pace.ts (the same engine the Blueprint reveal
// already trusts) — what's added here are semantic guards around its output.

type TimelineState = 'passed' | 'not_achievable' | 'tight' | 'comfortable' | 'unknown';
/** Above this, a required daily pace is not a plan — it's a scope problem. */
const MAX_SANE_HOURS_PER_DAY = 14;

interface Timeline {
  state: TimelineState;
  remainingHours: number;
  availableHours: number;
  requiredPerDay: number;
  committedPerDay: number | null;
  sparePerDay: number;
}

function computeTimeline(input: PrepInsightInput, matrix: MatrixEntry[]): Timeline | null {
  // 0 h/day is not a real answer (the picker's lowest option is 1) — treat it
  // as missing rather than dividing by it and printing an infinite shortfall.
  const hours = input.selfStudyHours != null && input.selfStudyHours > 0 ? input.selfStudyHours : null;
  if (!input.ambitionDate || hours == null) return null;

  const target = new Date(input.ambitionDate);
  if (Number.isNaN(target.getTime())) return null;

  const rows: TopicStatusRow[] = matrix.map((m) => ({ topic: m.topic, status: m.status }));
  const effort = studentEffortMultiplier({ isRepeater: input.isRepeater, lastYearPercentile: input.lastYearPercentile });
  const remainingHours = remainingSyllabusHours(rows, effort);

  if (target.getTime() <= input.today.getTime()) {
    return { state: 'passed', remainingHours, availableHours: 0, requiredPerDay: 0, committedPerDay: hours, sparePerDay: 0 };
  }

  const pace = computeRequiredPace({ remainingHours, today: input.today, targetDate: target, committedPerDay: hours });
  const availableHours = Math.round(hours * pace.daysLeft);

  let state: TimelineState;
  if (pace.requiredPerDay > MAX_SANE_HOURS_PER_DAY) state = 'not_achievable';
  else if (pace.status === 'behind' || pace.status === 'unrealistic') state = 'tight';
  else if (pace.status === 'ahead') state = 'comfortable';
  else state = 'unknown'; // on_pace / done — real, but not a finding worth a card

  return {
    state, remainingHours, availableHours,
    requiredPerDay: pace.requiredPerDay, committedPerDay: hours, sparePerDay: pace.aheadPerDay,
  };
}

interface Ctx {
  /** Exam topics only (those carrying TOPIC_METADATA) — section maths. */
  matrix: MatrixEntry[];
  /**
   * The COMPLETE declared matrix, including the MOCKS and READING habit
   * tracks. Those units deliberately carry no topic metadata, so filtering
   * the matrix down to metadata-bearing rows silently deleted them — which
   * made every mock detector read `null` and fire "not one full mock" at
   * students who mock weekly. Habit lookups must use this, never `matrix`.
   */
  habitMatrix: MatrixEntry[];
  bySection: SectionStats[];
  weakest: SectionStats;
  strongest: SectionStats;
  totalFinished: number;
  totalMastered: number;
  totalLearning: number;
  isRepeater: boolean | null;
  timeline: Timeline | null;
  foundation: FoundationGap | null;
}

type Detector = (ctx: Ctx) => PrepSignal | null;

// ── Detectors ────────────────────────────────────────────────────────────────

const detectTimeline: Detector = (ctx) => {
  const t = ctx.timeline;
  if (!t) return null;

  if (t.state === 'passed') {
    return {
      key: 'timeline-passed', rootCause: 'timeline', polarity: 'risk',
      severity: 9, confidence: 10, nonObvious: 3,
      headline: `Your plan is pointing at a date that's already gone.`,
      note: 'Everything downstream — daily load, revision, mocks — is being sized against it.',
      action: 'Pick a new date and the whole plan rebuilds around it.',
      recommend: 'set a new target date',
    };
  }
  if (t.state === 'not_achievable') {
    return {
      key: 'timeline-impossible', rootCause: 'timeline', polarity: 'risk',
      severity: 10, confidence: 10, nonObvious: 9,
      headline: `This date can't hold your syllabus.`,
      stats: [`~${t.remainingHours}h of study left`, `~${t.availableHours}h before your date`],
      note: `It isn't a matter of trying harder — the hours don't exist between here and there.`,
      action: 'Either the date moves or the scope shrinks. The plan can do either.',
      recommend: 'move the date or cut scope',
    };
  }
  if (t.state === 'tight') {
    // committedPerDay is non-null whenever a timeline exists (computeTimeline
    // returns null without it), but the compiler can't see that — and a bare
    // `!` here would be exactly the silent hole this codebase's engines don't
    // allow, so fall back to the arithmetic instead of asserting.
    const committed = t.committedPerDay ?? 0;
    const days = committed > 0 ? Math.round(t.availableHours / committed) : 0;
    const extra = Math.max(0.5, Math.round((t.requiredPerDay - committed) * 2) / 2);

    // Severity scales with the size of the gap. A half-hour a day is not
    // "YOUR BIGGEST RISK" — labelling it that way once cost the whole screen
    // its credibility, because the student can see it's noise.
    const severity = extra >= 3 ? 9 : extra >= 1.5 ? 7 : 4;

    // Never advise the impossible. "Find ~9.5h/day" is arithmetically true
    // and humanly absurd — the same failure as the old "390h/day", just
    // inside the sane range. Past ~3h of catch-up the honest advice is that
    // the date has to move.
    const action = extra > 3
      ? 'Realistically this date needs to move — the plan will suggest one that fits.'
      : `Find ~${extra}h/day, or move the date a little. The plan handles both.`;

    return {
      key: 'timeline-tight', rootCause: 'timeline', polarity: 'risk',
      severity, confidence: 10, nonObvious: 8,
      headline: extra >= 1.5
        ? `Your hours and your date don't agree.`
        : `You're a little behind your own date — nothing dramatic.`,
      stats: [`needs ~${t.requiredPerDay}h/day`, `you planned ${committed}h/day`, `~${t.remainingHours}h left over ${days} days`],
      action,
      recommend: extra > 3 ? 'move the date to one that fits' : `find ~${extra}h/day or shift the date`,
    };
  }
  if (t.state === 'comfortable') {
    return {
      key: 'timeline-comfortable', rootCause: 'timeline', polarity: 'strength',
      severity: 6, confidence: 10, nonObvious: 7,
      headline: `Time isn't your problem.`,
      stats: [`~${t.remainingHours}h of study left`, `~${t.sparePerDay}h/day spare`],
      note: `Most students are fighting the calendar. You aren't — which changes what you should spend the extra on.`,
      action: 'The plan will put your spare hours into mocks, not more topics.',
      recommend: 'put the spare hours into mocks',
    };
  }
  return null;
};

const detectFoundation: Detector = (ctx) => {
  const g = ctx.foundation;
  if (!g) return null;
  const depthPhrase = g.depth >= 2 ? ` — ${g.depth} levels beneath it —` : '';
  return {
    key: 'foundation-gap', rootCause: 'foundation', polarity: 'risk',
    severity: 8, confidence: 9, nonObvious: 10,
    headline: `You're building on an incomplete foundation.`,
    stats: [
      `${g.topic} → ${g.status === 'learning' ? 'learning' : g.status === 'revising' ? 'revising' : 'practising'}`,
      `${g.root}${depthPhrase} → untouched`,
    ],
    note: `That's why the hard questions feel random — you're above your own base.`,
    action: `The plan puts ${g.root} first, then unlocks ${g.topic}.`,
    recommend: `start ${g.root} before more ${g.topic}`,
  };
};

// The strategic version of "you're lopsided" — not "VARC is untouched"
// (which the student just tapped), but what that imbalance MEANS for where
// the next hour should go. Requires real depth somewhere, so it can't fire
// for a student who has simply barely started.
const detectImbalance: Detector = (ctx) => {
  const { strongest, weakest } = ctx;
  if (strongest.sec === weakest.sec) return null;
  const strongPct = strongest.weightTotal > 0 ? Math.round((strongest.weightDone / strongest.weightTotal) * 100) : 0;
  const weakPct = weakest.weightTotal > 0 ? Math.round((weakest.weightDone / weakest.weightTotal) * 100) : 0;
  // Real work on one side, near-nothing on the other. Two fully dormant
  // sections is itself the signal, so it qualifies at a lower gap than a
  // merely-lopsided student would — that case left a genuinely useful
  // finding hidden behind thresholds tuned for someone much further along.
  const dormantCount = ctx.bySection.filter((x) => x.finished.length === 0 && x.learning.length === 0).length;
  const qualifies = strongest.finished.length >= 3 && (strongPct - weakPct >= 35 || (dormantCount >= 2 && strongPct - weakPct >= 20));
  if (!qualifies) return null;

  const dormant = ctx.bySection.filter((s) => s.finished.length === 0 && s.learning.length === 0).map((s) => s.sec);
  const dormantPhrase = dormant.length === 2 ? `${dormant[0]} and ${dormant[1]} haven't started` : `${weakest.sec} has barely started`;

  return {
    key: 'imbalance-strategic', rootCause: 'imbalance', polarity: 'pattern',
    severity: 7, confidence: 8, nonObvious: 8,
    headline: `Your next hour in ${weakest.sec} is worth more than your next five in ${strongest.sec}.`,
    stats: [`${strongest.sec} ${strongPct}% covered`, `${weakest.sec} ${weakPct}%`],
    note: `${dormantPhrase.charAt(0).toUpperCase() + dormantPhrase.slice(1)} — and every section is scored separately.`,
    action: `The plan will hold ${strongest.sec} steady and open ${weakest.sec}.`,
    recommend: `move your next hours into ${weakest.sec}`,
  };
};

// Within-section only — this is what `weightage` actually means. Never
// compares importance across sections, and never calls it "marks".
const detectHighValueNeglect: Detector = (ctx) => {
  // Scans EVERY section, not just the weakest. The most interesting inversion
  // is often in a section the student HAS worked in — they finished the light
  // topics and left the heavy ones closed — and the weakest section (usually
  // one they've barely opened) has no finished topics to compare against at
  // all, so restricting to it silently hid the finding.
  let best: { sec: CoreSection; heavy: Row[]; done: number; delta: number } | null = null;
  for (const s of ctx.bySection) {
    if (s.finished.length === 0) continue;
    const heavy = s.untouched.filter((e) => e.meta.weightage >= 4).sort((a, b) => b.meta.weightage - a.meta.weightage);
    if (heavy.length === 0) continue;
    const delta = sumWeight(heavy) - s.weightDone;
    if (delta <= 0) continue;
    if (!best || delta > best.delta) best = { sec: s.sec, heavy, done: s.weightDone, delta };
  }
  if (!best) return null;
  const names = best.heavy.slice(0, 2).map((e) => e.topic).join(' and ');
  return {
    key: 'high-value-neglect', rootCause: 'high_value_neglect', polarity: 'pattern',
    severity: 7, confidence: 8, nonObvious: 8,
    headline: `You've finished the easier half of ${best.sec}.`,
    stats: [`still closed: ${names}`],
    note: `Those are the ones ${best.sec} is actually built on — and they're the ones still shut.`,
    action: `The plan opens ${best.heavy[0].topic} before anything lighter.`,
    recommend: `start ${best.heavy[0].topic} next`,
  };
};

const detectRcNeglect: Detector = (ctx) => {
  const vaTouched = VERBAL_SMALL.filter((t) => {
    const s = statusOf(ctx.matrix, t);
    return s != null && s !== 'not_started';
  }).length;
  const rc = statusOf(ctx.matrix, 'Reading Comprehension');
  if (vaTouched < 2 || (rc != null && isFinished(rc))) return null;
  return {
    key: 'rc-neglect', rootCause: 'high_value_neglect', polarity: 'pattern',
    severity: 6, confidence: 8, nonObvious: 7,
    headline: `You're polishing the small VARC questions and leaving the big one shut.`,
    stats: [`${vaTouched} smaller VARC topics started`, `Reading Comprehension → not in practice`],
    note: `RC is the largest block in VARC. The small ones can't cover for it.`,
    action: 'The plan brings Reading Comprehension in first.',
    recommend: 'bring Reading Comprehension into practice',
  };
};

const detectCoachingSequenceTrap: Detector = (ctx) => {
  const arith = clusterCounts(ctx.matrix, ARITHMETIC);
  const hard = clusterCounts(ctx.matrix, HARD_QA);
  if (arith.untouched < 5 || hard.finished < 2) return null;
  return {
    key: 'coaching-trap', rootCause: 'high_value_neglect', polarity: 'pattern',
    severity: 6, confidence: 7, nonObvious: 8,
    headline: `You've been following the coaching order, not the scoring order.`,
    stats: [`${hard.finished} harder QA chapters done`, `${arith.untouched} Arithmetic topics closed`],
    note: `Arithmetic is QA's broadest block — coaching usually reaches it last.`,
    action: 'The plan reorders around Arithmetic first.',
    recommend: 'start Arithmetic next',
  };
};

const detectUnfinished: Detector = (ctx) => {
  const { totalLearning, totalFinished } = ctx;
  if (totalLearning < 6 || totalLearning < 2 * Math.max(1, totalFinished)) return null;
  return {
    key: 'unfinished-pile', rootCause: 'unfinished', polarity: 'pattern',
    severity: 7, confidence: 8, nonObvious: 6,
    headline: `You're collecting topics, not finishing them.`,
    stats: [`${totalLearning + totalFinished} opened`, `${totalFinished} actually finished`],
    note: `Half-learned feels like progress on a checklist and scores nothing on the paper.`,
    action: 'The plan closes what\u2019s open before it opens anything new.',
    recommend: 'close open topics before opening new ones',
  };
};

const detectDifficultySkew: Detector = (ctx) => {
  const all = ctx.bySection.flatMap((s) => s.entries);
  const finished = all.filter((e) => isFinished(e.status));
  const untouched = all.filter((e) => e.status === 'not_started');
  if (finished.length < 4 || untouched.length < 4) return null;
  const avg = (rows: Row[]) => rows.reduce((s, r) => s + r.meta.difficulty, 0) / rows.length;
  const finishedAvg = avg(finished);
  const untouchedAvg = avg(untouched);
  if (untouchedAvg - finishedAvg < 1.0) return null;
  return {
    key: 'difficulty-skew', rootCause: 'difficulty', polarity: 'pattern',
    severity: 6, confidence: 6, nonObvious: 8,
    headline: `Your pace is about to slow down.`,
    stats: [`finished avg difficulty ${finishedAvg.toFixed(1)}`, `remaining avg ${untouchedAvg.toFixed(1)}`],
    note: `The easy half is behind you. Same hours will start covering fewer topics.`,
    action: 'The plan budgets more time per topic from here.',
    recommend: 'expect slower going on what remains',
  };
};

const detectMockNoErrorLog: Detector = (ctx) => {
  const fullMocks = statusOf(ctx.habitMatrix, 'Full Length Mocks');
  const errorLog = statusOf(ctx.habitMatrix, 'Error Log');
  const mockAnalysis = statusOf(ctx.habitMatrix, 'Mock Analysis');
  if (fullMocks == null || fullMocks === 'not_started') return null;
  const logMissing = errorLog == null || errorLog === 'not_started';
  const analysisMissing = mockAnalysis == null || mockAnalysis === 'not_started';
  if (!logMissing && !analysisMissing) return null;
  return {
    key: 'mock-no-log', rootCause: 'mock_readiness', polarity: 'risk',
    severity: 7, confidence: 9, nonObvious: 7,
    headline: `You're paying for mocks and not collecting the lesson.`,
    stats: [`mocks → yes`, `${logMissing ? 'error log' : 'mock analysis'} → not started`],
    note: `Without it the same mistakes come back on the next one, and the score sits still.`,
    action: 'The plan adds a short debrief after every mock.',
    recommend: 'start an error log from the next mock',
  };
};

const detectNeverMocked: Detector = (ctx) => {
  const fullMocks = statusOf(ctx.habitMatrix, 'Full Length Mocks');
  if (ctx.totalFinished < 8) return null;
  // Absent row (a matrix saved before habit tracks existed) is NOT evidence
  // of never mocking — stay silent rather than accuse.
  if (fullMocks == null) return null;
  if (fullMocks !== 'not_started') return null;
  // Same fact, two very different students. Someone deep into the syllabus
  // has EARNED the next step and should hear it that way; someone earlier is
  // being warned. Reporting the empty checkbox identically to both was the
  // single most-repeated dull card in the audit.
  const heavy = ctx.totalFinished >= 20;
  return {
    key: 'never-mocked', rootCause: 'mock_readiness', polarity: 'risk',
    severity: heavy ? 9 : 7, confidence: 9, nonObvious: heavy ? 8 : 6,
    headline: heavy
      ? `You've done the hard part. You just don't know what it's worth yet.`
      : `You're preparing a syllabus, not an exam.`,
    stats: [`${ctx.totalFinished} topics finished`, `full mocks → none`],
    note: heavy
      ? `Coverage this deep with no mock means your score is still a guess — to you and to us.`
      : `Studying and testing are different skills, and only one of them is scored in November.`,
    action: 'The plan schedules your first full mock this week.',
    recommend: 'take one full mock this week',
  };
};

// ── Strengths — earned, never manufactured ───────────────────────────────────
//
// P1-2: v1 guaranteed a green card, so it shipped "QA is your strongest"
// alongside "your QA foundation is broken" — schizophrenic, and it taught
// students the positive line was decoration. A strength now requires real
// mastery evidence (topics at `revising`, not merely touched), and is
// suppressed entirely if the same section carries an active risk.

const detectSectionStrength: Detector = (ctx) => {
  const { strongest } = ctx;
  if (strongest.weightTotal === 0) return null;
  // Mastery, not activity: at least two topics actually in revision.
  if (strongest.mastered.length < 2) return null;
  const pct = Math.round((strongest.weightDone / strongest.weightTotal) * 100);
  if (pct < 40) return null;
  return {
    key: 'section-strength', rootCause: 'imbalance', polarity: 'strength',
    severity: pct >= 60 ? 6 : 4, confidence: 9, nonObvious: 5,
    headline: `${strongest.sec} is real progress — not just activity.`,
    stats: [`${strongest.mastered.length} topics in revision`, `${pct}% of ${strongest.sec} covered`],
    note: `Revision stage is the part most students never reach. This is worth defending.`,
    action: `The plan holds ${strongest.sec} on light revision instead of restarting it.`,
    recommend: `hold ${strongest.sec} with light revision`,
  };
};

const detectMockHygiene: Detector = (ctx) => {
  const active = (t: string) => {
    const s = statusOf(ctx.habitMatrix, t);
    return s != null && s !== 'not_started';
  };
  if (!active('Full Length Mocks') || !active('Error Log') || !active('Mock Analysis')) return null;
  return {
    key: 'mock-hygiene', rootCause: 'mock_readiness', polarity: 'strength',
    severity: 6, confidence: 9, nonObvious: 6,
    headline: `Your testing loop is already right.`,
    stats: [`mocks + analysis + error log — all running`],
    note: `Most students run one of those three. Running all three is what actually moves a score.`,
    action: 'The plan keeps this weekly and builds around it.',
    recommend: 'keep the mock loop weekly',
  };
};

const detectSequencingStrength: Detector = (ctx) => {
  if (ctx.foundation != null) return null; // contradicted
  if (ctx.totalFinished < 5) return null;
  return {
    key: 'sequencing-strength', rootCause: 'foundation', polarity: 'strength',
    severity: 5, confidence: 8, nonObvious: 7,
    headline: `You've been building in the right order.`,
    stats: [`no foundation gaps across ${ctx.totalFinished} topics`],
    note: `Nothing you're practising sits on top of something you skipped — rarer than it sounds.`,
    action: 'The plan keeps following your sequence rather than resetting it.',
    recommend: 'keep following the sequence',
  };
};

const detectFinalStretch: Detector = (ctx) => {
  const totalTopics = ctx.bySection.reduce((n, s) => n + s.entries.length, 0);
  if (totalTopics === 0) return null;
  const covered = ctx.bySection.reduce((n, s) => n + s.weightDone, 0);
  const total = ctx.bySection.reduce((n, s) => n + s.weightTotal, 0);
  const pct = total > 0 ? Math.round((covered / total) * 100) : 0;
  if (pct < 65) return null;
  const left = ctx.bySection.reduce((n, s) => n + s.untouched.length + s.learning.length, 0);
  if (left === 0) return null;
  return {
    key: 'final-stretch', rootCause: 'unfinished', polarity: 'pattern',
    severity: 6, confidence: 9, nonObvious: 7,
    headline: `You're closer to the end of the syllabus than the start.`,
    stats: [`${left} topic${left === 1 ? '' : 's'} still open`],
    note: `From here the risk stops being coverage and starts being retention — what you finished in June is fading while you finish July.`,
    action: 'The plan shifts from covering new topics to holding the ones you have.',
    recommend: 'switch from covering to consolidating',
  };
};

const RISK_DETECTORS: Detector[] = [
  detectTimeline, detectFoundation, detectImbalance, detectHighValueNeglect,
  detectRcNeglect, detectCoachingSequenceTrap, detectUnfinished, detectDifficultySkew,
  detectMockNoErrorLog, detectNeverMocked, detectFinalStretch,
];
const STRENGTH_DETECTORS: Detector[] = [
  detectTimeline, detectSectionStrength, detectMockHygiene, detectSequencingStrength,
];

/**
 * Ranking. severity × confidence establishes "is this real and important";
 * the non-obviousness multiplier then discounts anything the student could
 * have read off their own answers. A pure restatement (nonObvious 1) keeps
 * less than half its weight, so a genuine inference beats an obvious fact of
 * similar severity — while a catastrophic-but-obvious finding (a date that
 * has already passed) still surfaces, which is why this is a multiplier and
 * not a filter.
 */
function rank(sig: PrepSignal): number {
  return sig.severity * sig.confidence * (0.4 + 0.06 * sig.nonObvious);
}

/** At most one card per root cause — no student sees one problem described twice. */
function dedupeByRootCause(signals: PrepSignal[]): PrepSignal[] {
  const best = new Map<RootCause, PrepSignal>();
  for (const s of signals) {
    const cur = best.get(s.rootCause);
    if (!cur || rank(s) > rank(cur)) best.set(s.rootCause, s);
  }
  return [...best.values()].sort((a, b) => rank(b) - rank(a));
}

/** Highest-priority prerequisite-free topic per section — a real place to begin. */
function startingPoints(bySection: SectionStats[]): StartingPoint[] {
  const out: StartingPoint[] = [];
  for (const s of bySection) {
    const open = s.entries
      .filter((e) => e.status === 'not_started' && e.meta.prerequisites.length === 0)
      .sort((a, b) => b.meta.weightage - a.meta.weightage || a.meta.sequenceRank - b.meta.sequenceRank);
    if (open[0]) out.push({ sec: s.sec, topic: open[0].topic });
  }
  return out;
}

/**
 * Below this much real activity, there is nothing defensible to diagnose.
 * Saying so plainly beats dressing up "VARC is untouched" as a discovery —
 * the student tapped that themselves 30 seconds ago, and pretending it is a
 * finding is exactly what made v1 feel hollow.
 */
const MIN_ACTIVITY_TO_DIAGNOSE = 3;

export function computePrepInsight(input: PrepInsightInput): PrepInsightResult {
  // Two views of the same declaration, deliberately: `matrix` is exam topics
  // only (everything carrying TOPIC_METADATA) for the section maths, while
  // `habitMatrix` keeps every declared row including the MOCKS and READING
  // tracks. Those habit units carry no topic metadata by design, so the
  // filtered view silently deleted them — and the mock detectors, reading
  // `null` for every student, told people who mock weekly that they had
  // never taken a mock.
  const habitMatrix = input.matrix ?? [];
  const matrix = habitMatrix.filter((m) => TOPIC_METADATA[m.topic]);
  const bySection = buildSectionStats(matrix);

  const sectionCoverage: SectionCoverage[] = bySection.map((s) => ({
    sec: s.sec,
    donePct: s.weightTotal > 0 ? Math.round((s.weightDone / s.weightTotal) * 100) : 0,
    inProgressPct: s.weightTotal > 0 ? Math.round((s.weightLearning / s.weightTotal) * 100) : 0,
    finishedCount: s.finished.length,
    totalCount: s.entries.length,
  }));

  const totalFinished = bySection.reduce((s, x) => s + x.finished.length, 0);
  const totalMastered = bySection.reduce((s, x) => s + x.mastered.length, 0);
  const totalLearning = bySection.reduce((s, x) => s + x.learning.length, 0);

  const timeline = computeTimeline(input, matrix);

  const sorted = [...bySection].sort((a, b) => b.gap - a.gap || TIE_ORDER[a.sec] - TIE_ORDER[b.sec]);
  const weakest = sorted[0];
  const strongest = sorted[sorted.length - 1];
  const foundation = findFoundationGap(bySection, matrix);

  // Not enough real activity to name a weakness honestly.
  //
  // Two findings still escape this gate, because both are fully supported by
  // a single tap plus data the student never sees, and suppressing them was
  // the audit's worst false negative: a student practising Functions with
  // Linear Equations untouched got NO cards at all, losing the single
  // highest-value insight the engine can produce.
  //   · a hard timeline blocker (a date already passed is true regardless)
  //   · a foundation gap (the prerequisite graph, not the student's volume)
  if (totalFinished + totalLearning < MIN_ACTIVITY_TO_DIAGNOSE) {
    const earlyCtx: Ctx = {
      matrix, habitMatrix, bySection, weakest, strongest,
      totalFinished, totalMastered, totalLearning,
      isRepeater: input.isRepeater, timeline, foundation,
    };
    const early: PrepSignal[] = [];
    const t = timeline && (timeline.state === 'passed' || timeline.state === 'not_achievable') ? detectTimeline(earlyCtx) : null;
    if (t) early.push(t);
    const f = detectFoundation(earlyCtx);
    if (f) early.push(f);
    return {
      state: early.length > 0 ? 'diagnosed' : 'insufficient_evidence',
      sectionCoverage,
      cards: early.sort((a, b) => rank(b) - rank(a)).slice(0, 2),
      strength: null,
      startingPoints: startingPoints(bySection),
      synthesis: early.length > 0 ? early.map((c) => c.recommend).join(' — then ') : null,
    };
  }

  const ctx: Ctx = {
    matrix, habitMatrix, bySection, weakest, strongest,
    totalFinished, totalMastered, totalLearning,
    isRepeater: input.isRepeater, timeline, foundation,
  };

  const risks = dedupeByRootCause(
    RISK_DETECTORS.map((d) => d(ctx)).filter((s): s is PrepSignal => s != null).filter((s) => s.polarity !== 'strength')
  );
  const cards = risks.slice(0, 2);

  // A strength must not contradict a finding the student is reading directly
  // above it, so anything sharing a root cause with a shown card is dropped.
  const shownCauses = new Set(cards.map((c) => c.rootCause));
  const strength = dedupeByRootCause(
    STRENGTH_DETECTORS.map((d) => d(ctx)).filter((s): s is PrepSignal => s != null).filter((s) => s.polarity === 'strength')
  ).filter((s) => !shownCauses.has(s.rootCause))[0] ?? null;

  const synthesis = cards.length > 0 ? cards.map((c) => c.recommend).join(' — then ') : null;

  return { state: 'diagnosed', sectionCoverage, cards, strength, startingPoints: startingPoints(bySection), synthesis };
}
