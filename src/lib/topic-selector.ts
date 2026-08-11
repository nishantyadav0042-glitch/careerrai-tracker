// The Topic Selector — answers "which topic in this section, for THIS
// student, today" by combining the Topic Graph (topics-constants.ts),
// Coverage Matrix status, and revision recency. Same additive-score
// architecture as mission-engine.ts and buddy-match.ts: every input adds
// points, the highest score wins, and the winning score's contributors ARE
// the explanation — never a rule tree, never a black box.
//
// This directly replaces the old behavior where two of three daily tasks
// used a single static "highest-weightage topic" for every student in the
// product, regardless of that student's own Coverage Matrix. A student who
// has never touched the Coverage Matrix still gets a sensible answer (see
// CoverageStatus 'unknown' below) — this is additive, not a breaking change.

import { TOPIC_METADATA, qaCluster } from './topics-constants';
import { STATUS_ORDER, type CoverageStatus } from './coverage-status';
import { newTopicUrgencyPoints, repeatPenaltyPoints, revisionWeight } from './syllabus-pace';

// Student-controlled states (declared in the Blueprint Builder):
//   not_started (⚪ Haven't Started) · learning (🟡 Learning Concepts) ·
//   practicing (🔵 Practicing Questions) · revising (🟠 Revision Started)
// System-controlled state (never a self-report option):
//   exam_ready (🟢) — earned through confidence signals (applyConfidenceSignal
//   below), mock evidence, and revision discipline.
// "Revision DUE" is DERIVED (practicing/revising/exam_ready + past the
// topic's revision cadence), never stored — see prep-memory's revisionOverdue.
export type { CoverageStatus };

export interface TopicCandidateInput {
  topic: string;
  // null = this topic has never been touched in the Coverage Matrix at all
  // (distinct from 'not_started', which is an explicit self-reported status)
  coverageStatus: CoverageStatus | null;
  daysSinceLastPracticed: number | null;
  // A one-time onboarding self-report (the pre-existing weak-topic tap)
  // still counts for something — it's real signal, just not the only
  // signal anymore. This never overrides a strong Coverage Matrix/
  // prerequisite case, it only breaks close ties toward it.
  selfReportedBonus?: boolean;
  // Student-chosen priority (starred in the Preparation Map, max 5). Strong
  // (+25) — a priority topic beats same-status peers decisively — but still
  // additive: an unmet prerequisite (-18) or a heavily revision-overdue
  // alternative can outrank it, so priority steers the plan without letting
  // a student break their own sequencing.
  priorityBonus?: boolean;
  /** The coaching timetable puts this topic on TODAY. The strongest pull of
   *  all: the whole point of uploading a timetable is that when class teaches
   *  Percentages, the plan says Percentages — today, not eventually. */
  todayClassBonus?: boolean;
  // "Start my preparation with <cluster>" — the student's chosen opening
  // cluster (e.g. Arithmetic). A steady bias, not an override: prerequisites
  // and revision-due still apply, so ownership never breaks sequencing.
  focusBonus?: boolean;
  // The student swapped this topic OUT of yesterday's plan. Product rule:
  // never delete, always postpone — +40 makes its return tomorrow all but
  // guaranteed, so a swap can never quietly lose work.
  postponedBonus?: boolean;
  /**
   * Days since this topic was last PUT ON THE PLAN — which is not the same as
   * when it was last practised.
   *
   * Abhishek's plan served Percentages seven times in twelve days. The score
   * only knew `daysSinceLastPracticed`, which a student who skips a task never
   * updates — so a topic could be served, ignored, and served again the next
   * day, forever. This is the signal that stops that.
   */
  daysSincePlanned?: number | null;
}

export interface TopicChoice {
  topic: string;
  score: number;
  reasons: string[];
  /**
   * The chosen topic's coverage status, carried out of the selector so the
   * task VERB can match it. Without this the label was written from the
   * calendar phase alone, so in August every task read "Learn X" — including
   * topics the student had been practising for weeks. See Incident #20.
   */
  coverageStatus: CoverageStatus | null;
}

// Coverage status → points. REBALANCED after real student feedback (16 Jul:
// "I'd done Arithmetic + Geometry and expected Algebra next, but got PNC").
// Old model over-rewarded novelty (not_started=30 >> everything), so a brand-new
// LOW-weightage topic beat an in-progress HIGH-weightage one. New philosophy:
// FINISH what you started before opening new topics — an in-progress ('learning')
// topic leads; untouched ones then surface by weightage (the dominant driver
// below). "Strong" topics mostly return via revision-due, not raw coverage.
const COVERAGE_POINTS: Record<CoverageStatus | 'unknown', number> = {
  learning: 30,     // in progress — finish it before starting something new
  not_started: 22,
  unknown: 20,
  practicing: 12,   // usually resurfaced via revision-due, below
  revising: 8,
  exam_ready: 2,
};

// ── The ONE topic-priority score (10 Aug consolidation) ─────────────────────
//
// Founder's ruling: "finish what you started." There used to be TWO rankers —
// this one (learning > not_started) and study-forecast.buildWeekPlan (the
// OPPOSITE, not_started > learning) — so the daily card and the whole plan
// ordered topics against each other. This is now the single authority for the
// coverage + weightage + sequence + prerequisite part of the score. The daily
// card (chooseTopicForSection) layers per-day signals — revision-due, the
// student's own priority/focus/postpone taps, today's class — on top of THIS;
// the whole plan (buildWeekPlan) uses THIS alone for ordering. One philosophy,
// two surfaces that can no longer disagree about which topic comes next.
export function baseCoverageScore(input: {
  status: CoverageStatus | 'unknown';
  weightage: number;      // TOPIC_METADATA.weightage
  sequenceRank: number;   // TOPIC_METADATA.sequenceRank
  prereqUnmet: boolean;   // a prerequisite still not_started/unknown
}): number {
  return COVERAGE_POINTS[input.status]
    + input.weightage * 8                              // weightage is the primary driver (8–40)
    + Math.max(0, 30 - input.sequenceRank) * 0.5       // pedagogical order nudge
    + (input.prereqUnmet ? -18 : 0);                   // deprioritise (never exclude) unmet prereqs
}

// Keywords, not sentences — the card shows "Why?" + a 2-4 word fact.
// Every number is still real.
function coverageReason(topic: string, status: CoverageStatus | null): string | null {
  if (status == null) return 'Not mapped yet';
  if (status === 'not_started') return 'Never started';
  if (status === 'learning') return 'Concepts in progress';
  return null; // practicing/revising/exam_ready only explained via revision-due below, not coverage alone
}

// revisionMultiplier: the archetype coefficient from
// routine-engine.ts's archetypeRevisionMultiplier() — a repeater's cycle
// tightens (<1), a working professional's loosens (>1), applied to every
// topic's revisionFrequencyDays before checking overdue, not a separate
// rule per archetype.
// The expert "why this topic" line for the CHOSEN topic — legible reasoning in
// the student's mental-model language (weightage share + their own progress), so
// an experienced student can see the engine understands CAT, not a black box.
// Student-action reasons win (it's THEIR call); then revision-due; then the
// weightage+coverage rationale.
function expertWhy(c: TopicCandidateInput, revisionMultiplier: number): string {
  const meta = TOPIC_METADATA[c.topic];
  if (c.todayClassBonus) return "Your coaching teaches this today — study in sync";
  if (c.postponedBonus) return "Back from yesterday's swap — as promised";
  if (c.priorityBonus) return 'Your priority pick';
  if (c.focusBonus) return 'Your chosen starting point';
  if (meta && c.daysSinceLastPracticed != null && c.daysSinceLastPracticed > meta.revisionFrequencyDays * revisionMultiplier) {
    return `Revision due — last practised ${c.daysSinceLastPracticed}d ago`;
  }
  const started = c.coverageStatus === 'learning';
  const cl = qaCluster(c.topic);
  if (cl) return started ? `${cl.name} — ${cl.share}. Finish what you started.` : `${cl.name} — ${cl.share}.`;
  // VARC / DILR: weightage tier (RC, Arrangements, DI carry most marks)
  const high = (meta?.weightage ?? 3) >= 4;
  if (started) return 'Finish what you started.';
  return high ? 'A high-scoring area — worth the marks.' : 'On your plan for today.';
}

// revisionSeason (founder, 21 July): from 1 SEPTEMBER of the exam year,
// structured revision opens — overdue revision outweighs starting something
// new, and HIGH-WEIGHTAGE overdue topics (Arithmetic, Algebra, RC,
// Arrangements — where CAT marks actually live) jump the queue. This mirrors
// how toppers actually prep: syllabus + weekly mocks through August, then
// September onwards the marks come from revising what you know, weightage
// first — not from chasing low-yield new topics.
export function chooseTopicForSection(
  candidates: TopicCandidateInput[],
  revisionMultiplier = 1,
  revisionSeason = false,
  /**
   * How urgently the calendar needs NEW topics opened (0–1, from
   * syllabus-pace.syllabusPace). Defaults to 0 so every existing caller keeps
   * its exact previous behaviour until it passes real pace in.
   */
  newTopicPressure = 0
): TopicChoice {
  const scored = candidates.map((c) => {
    const meta = TOPIC_METADATA[c.topic];
    const reasons: string[] = [];

    const coveragePoints = COVERAGE_POINTS[c.coverageStatus ?? 'unknown'];
    const covReason = coverageReason(c.topic, c.coverageStatus);
    if (covReason) reasons.push(covReason);

    // Weightage is now the PRIMARY driver (8–40): CAT is a weightage game, so a
    // high-scoring area (Algebra, Percentages, RC) must beat a low-scoring one
    // (PNC, Vocabulary) unless revision-due or an unmet prerequisite says
    // otherwise. This is the core of the 16 Jul fix.
    const weightagePoints = (meta?.weightage ?? 3) * 8; // 8–40
    if (meta && meta.weightage >= 4) reasons.push('High-scoring area');

    // Pedagogical order: earlier-sequence topics (Arithmetic → Algebra →
    // Geometry → Modern Math → Number System) get a mild nudge so the plan
    // advances through the cluster sensibly instead of jumping ahead.
    const sequencePoints = meta ? Math.max(0, 30 - meta.sequenceRank) * 0.5 : 0;

    let revisionPoints = 0;
    if (meta && c.daysSinceLastPracticed != null) {
      const adjustedFrequency = meta.revisionFrequencyDays * revisionMultiplier;
      const overdue = Math.min(Math.max(c.daysSinceLastPracticed - adjustedFrequency, 0), 10);
      // Revision season doubles the pull of overdue topics, and overdue
      // HIGH-weightage topics get a further jump — September onwards the
      // plan revises where the marks are before it opens anything new.
      // Damped by syllabus pressure: full pull when on pace, 40% when the
      // student cannot finish. See syllabus-pace.revisionWeight.
      revisionPoints = overdue * (revisionSeason ? 6 : 3) * revisionWeight(newTopicPressure);
      if (revisionSeason && overdue > 0 && (meta.weightage ?? 3) >= 4) {
        revisionPoints += 15;
        reasons.push('Revision season — high-weightage first');
      }
      if (overdue > 0) reasons.push(`Last practised ${c.daysSinceLastPracticed} day${c.daysSinceLastPracticed === 1 ? '' : 's'} ago`);
    }

    // Prerequisite gate: a real edge, not a rank-order guess. A topic whose
    // prerequisite is itself still unstarted/unknown is deprioritized —
    // never excluded outright, since sparse data shouldn't hard-block a
    // choice, only make a better-grounded alternative win the tie.
    let prereqPenalty = 0;
    if (meta?.prerequisites?.length) {
      const unmet = meta.prerequisites.filter((p) => {
        const prereqCandidate = candidates.find((x) => x.topic === p);
        const prereqStatus = prereqCandidate?.coverageStatus ?? null;
        return prereqStatus == null || prereqStatus === 'not_started';
      });
      if (unmet.length > 0) prereqPenalty = -18;
    }

    const selfReportPoints = c.selfReportedBonus ? 12 : 0;
    if (c.selfReportedBonus) reasons.push('Your toughest pick');

    const priorityPoints = c.priorityBonus ? 25 : 0;
    if (c.priorityBonus) reasons.unshift('Your priority pick');

    const focusPoints = c.focusBonus ? 22 : 0;
    if (c.focusBonus) reasons.unshift('Your "start with" pick');

    // 50, above today's class: "back tomorrow" was said to the student in
    // words, and a broken promise costs more trust than a missed sync.
    const postponedPoints = c.postponedBonus ? 50 : 0;
    if (c.postponedBonus) reasons.unshift("Back from yesterday's swap");

    // Outranks everything except a same-day postponement promise. 45 beats the
    // 25-point evergreen priority flag by design: a topic taught TODAY must
    // beat one the coaching will teach eventually, or uploading a timetable
    // changes nothing a student can see (founder, 7 Aug).
    const todayClassPoints = c.todayClassBonus ? 45 : 0;
    if (c.todayClassBonus) reasons.unshift('On your coaching timetable today');

    // Coverage + weightage + sequence + prereq now come from the ONE shared
    // scorer (identical value to before); the daily card layers its per-day
    // signals on top. The whole plan uses the same base, so they agree.
    void coveragePoints; void weightagePoints; void sequencePoints; // read into baseCoverageScore below
    const base = baseCoverageScore({
      status: c.coverageStatus ?? 'unknown',
      weightage: meta?.weightage ?? 3,
      sequenceRank: meta?.sequenceRank ?? 30,
      prereqUnmet: prereqPenalty < 0,
    });
    // ── The two terms that broke the Percentages loop (11 Aug) ──────────────
    //
    // Untouched topics earn from the CALENDAR. Revision tops out at +30, so
    // without this a topic already practised permanently outranked one never
    // seen, and 23 of Abhishek's QA topics were never scheduled once in 18
    // days. At zero pressure this is 0 — a student who is ahead of schedule
    // still gets a revision-led plan, exactly as before.
    const untouched = c.coverageStatus == null || c.coverageStatus === 'not_started';
    const newTopicPoints = untouched ? newTopicUrgencyPoints(newTopicPressure) : 0;
    if (newTopicPoints > 0) reasons.push('New topic — syllabus needs it');

    // And a topic the plan showed in the last couple of days is pushed down,
    // whether or not the student actually did it. Serving the same topic every
    // second day is how "finish what you started" turned into "never start
    // anything else".
    const repeatPenalty = repeatPenaltyPoints(c.daysSincePlanned ?? null, newTopicPressure);

    const score =
      base + revisionPoints + selfReportPoints + priorityPoints + focusPoints +
      postponedPoints + todayClassPoints + newTopicPoints + repeatPenalty;
    return { topic: c.topic, score, reasons };
  });

  scored.sort((a, b) => b.score - a.score);
  const winner = scored[0];
  const winnerCand = candidates.find((c) => c.topic === winner.topic)!;
  // The chosen topic leads with the expert "why"; keep a secondary keyword reason.
  const why = expertWhy(winnerCand, revisionMultiplier);
  return {
    topic: winner.topic, score: winner.score,
    reasons: [why, ...winner.reasons].slice(0, 2),
    coverageStatus: winnerCand.coverageStatus,
  };
}

/**
 * The top N topics for a section, all distinct.
 *
 * Founder, 11 Aug: "unke timetable ke according saare 46 ke 46 topics cover
 * hone chahiye." That is impossible one-topic-per-section-per-day: Abhishek
 * studies ELEVEN HOURS and the plan gave him three topics — 4.4 hours on
 * Percentages alone. Twenty-five days x one QA slot cannot open 28 QA topics
 * while also revising, no matter how the ranking is tuned.
 *
 * So a day's topic count now follows the student's hours (routine-engine), and
 * this returns as many DISTINCT winners as that day can hold. Each pick is
 * scored by the same rules; picking one simply removes it from the running so
 * the second-best genuinely differs.
 */
export function chooseTopicsForSection(
  candidates: TopicCandidateInput[],
  count: number,
  revisionMultiplier = 1,
  revisionSeason = false,
  newTopicPressure = 0
): TopicChoice[] {
  const picks: TopicChoice[] = [];
  let pool = candidates;
  for (let i = 0; i < Math.max(1, count) && pool.length > 0; i++) {
    const choice = chooseTopicForSection(pool, revisionMultiplier, revisionSeason, newTopicPressure);
    picks.push(choice);
    pool = pool.filter((c) => c.topic !== choice.topic);
  }
  return picks;
}

/**
 * ── The syllabus clock and the memory clock, separated ──────────────────────
 *
 * Founder, 11 Aug: "syllabus clock alag karo aur sabke liye 46/46 karo."
 *
 * Everything before this made first-contact COMPETE with revision inside one
 * score. That is why the guarantee was only ever as strong as the weight
 * holding it up: proven on real profiles, 46/46 held at +28 for exactly one
 * student and collapsed to 43/46 for him at +20, while seven other profiles
 * failed even at the shipped weight. A 90-day student had 540 slots for 46
 * topics and still left 7 unopened — starvation with a half-empty calendar,
 * because pressure is a function of RATE and a distant deadline reads as
 * "relaxed" right up until the endgame.
 *
 * So the day's blocks are now DIVIDED between two clocks before any ranking
 * happens, instead of being contested by one:
 *
 *   SYLLABUS CLOCK — marches through committed scope. Gets at least one block
 *     a day per section while any topic remains unopened, and more when the
 *     remaining topics per remaining day demand it.
 *   MEMORY CLOCK   — revision of what is already open. Gets whatever the
 *     syllabus clock does not need, and is silent while it needs everything.
 *
 * The guarantee is now arithmetic, not tuning: reserve ≥1 first-contact block
 * per section per day and every topic is opened in `untouched` days, which is
 * why it survives at any weight. Scores still decide WHICH topic each clock
 * picks — that part was never the problem.
 */
export interface SectionDayInput {
  /** Topics never opened (coverage 'not_started' or unmapped). */
  untouchedCount: number;
  /** Days until the student's chosen syllabus-finish date; null = not set. */
  daysToTarget: number | null;
  revisionMultiplier?: number;
  revisionSeason?: boolean;
  /** Pressure still shapes ordering WITHIN each clock; it no longer gates novelty. */
  newTopicPressure?: number;
}

export function chooseSectionDay(
  candidates: TopicCandidateInput[],
  blocks: number,
  input: SectionDayInput
): TopicChoice[] {
  const capacity = Math.max(1, blocks);
  const { untouchedCount, daysToTarget } = input;
  const mult = input.revisionMultiplier ?? 1;
  const season = input.revisionSeason ?? false;
  const pressure = input.newTopicPressure ?? 0;

  // How many of today's blocks the syllabus clock needs.
  let syllabusBlocks = 0;
  if (untouchedCount > 0) {
    // At least one a day — the floor that makes the guarantee structural.
    // More when the remaining topics will not fit one-a-day in the days left.
    //
    // NO DATE SET is the floor, not the ceiling. It used to mean `untouchedCount`,
    // which saturated the day: a student who never picked a syllabus-finish date
    // got every block in every section spent on first contact and no revision at
    // all — the exact mirror of Abhishek's all-revision loop, and live for 47 of
    // 280 students on 11 Aug. Without a date there is no deadline to be behind,
    // so the syllabus clock takes its one block and the memory clock keeps the
    // rest. One block a day per section still opens all 46 inside three weeks.
    const perDay = daysToTarget != null && daysToTarget > 0
      ? Math.ceil(untouchedCount / daysToTarget)
      : 1;
    syllabusBlocks = Math.min(capacity, Math.max(1, perDay));
  }

  const isUntouched = (c: TopicCandidateInput) =>
    c.coverageStatus == null || c.coverageStatus === 'not_started';

  // A student action outranks the split itself: a postponed topic was promised
  // back "tomorrow" in words, and today's coaching class is a fixed appointment.
  // Those keep their claim on a block whichever clock they belong to.
  const claimed = candidates.filter((c) => c.postponedBonus || c.todayClassBonus);
  const picks: TopicChoice[] = [];
  const taken = new Set<string>();
  for (const c of claimed.slice(0, capacity)) {
    const one = chooseTopicForSection([c], mult, season, pressure);
    picks.push(one);
    taken.add(one.topic);
  }

  const remaining = () => capacity - picks.length;
  const pool = (want: 'new' | 'revision') =>
    candidates.filter((c) => !taken.has(c.topic) && (want === 'new' ? isUntouched(c) : !isUntouched(c)));

  // Syllabus clock first — it is the one with a deadline.
  const wantNew = Math.max(0, Math.min(remaining(), syllabusBlocks - picks.filter((p) => {
    const c = candidates.find((x) => x.topic === p.topic);
    return c ? isUntouched(c) : false;
  }).length));
  for (const p of chooseTopicsForSection(pool('new'), wantNew, mult, season, pressure)) {
    if (picks.length >= capacity) break;
    picks.push(p); taken.add(p.topic);
  }

  // Memory clock takes what is left.
  for (const p of chooseTopicsForSection(pool('revision'), remaining(), mult, season, pressure)) {
    if (picks.length >= capacity) break;
    picks.push(p); taken.add(p.topic);
  }

  // A short section (everything already open, or nothing left to revise) simply
  // fills from whatever remains rather than returning fewer tasks than the
  // student has time for.
  if (picks.length < capacity) {
    const rest = candidates.filter((c) => !taken.has(c.topic));
    for (const p of chooseTopicsForSection(rest, capacity - picks.length, mult, season, pressure)) {
      picks.push(p); taken.add(p.topic);
    }
  }

  return picks.slice(0, capacity);
}

export type ConfidenceSignal = 'green' | 'blue' | 'yellow' | 'red';

const PRACTICING_RANK = STATUS_ORDER.indexOf('practicing');
const REVISING_RANK = STATUS_ORDER.indexOf('revising');

// Confidence-aware planning — a tap is honest signal about EFFORT and FEEL,
// so it may move a topic through the working stages. It is NOT evidence of
// ability, so it can never finish one.
//
// This function used to let a green tap promote 'revising' → 'exam_ready'
// ("earned from a green tap"). That was a second, competing definition of
// earned: the evidence ladder demands volume AND accuracy at every
// difficulty; this path demanded a feeling, four times. Self-assessment
// correlates with measured ability at only r ≈ 0.29 (Mabe & West 1982;
// Zell & Krizan 2014), and the weakest students overrate themselves the most
// (Kruger & Dunning 1999) — so a tap-earned "Exam ready" would be MOST wrong
// for exactly the students who most need it to be true. There is now one
// definition: all six checks in evidence.ts, and nothing else.
//   green   — advance one level, capped at 'revising'; the last step is
//             evidence-only (see coverage-status.EXAM_READY_SOURCE)
//   blue    — real progress, not full confidence yet: advance one level but
//             capped at 'practicing' — never pushes a topic into 'revising'
//             or 'exam_ready' off a "getting there" tap
//   yellow  — acknowledges the attempt; only moves an untouched topic to
//             'learning', never advances or regresses one already in progress
//   red     — a real regression signal: struggling on a topic at
//             'practicing'/'revising'/'exam_ready' means it isn't holding, so
//             it drops back to 'learning' — never all the way to
//             'not_started', since the attempt itself is still real signal
export function applyConfidenceSignal(current: CoverageStatus | null, confidence: ConfidenceSignal): CoverageStatus {
  const rank = STATUS_ORDER.indexOf(current ?? 'not_started');
  // 'revising' is the ceiling a tap can reach; a topic already ABOVE it (an
  // evidence-earned exam_ready) is never pulled back down by more green taps.
  if (confidence === 'green') return STATUS_ORDER[rank >= REVISING_RANK ? rank : rank + 1];
  if (confidence === 'blue') return STATUS_ORDER[rank >= PRACTICING_RANK ? rank : rank + 1];
  if (confidence === 'red') return 'learning';
  return rank === 0 ? 'learning' : STATUS_ORDER[rank];
}
