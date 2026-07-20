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

// Student-controlled states (declared in the Blueprint Builder):
//   not_started (⚪ Haven't Started) · learning (🟡 Learning Concepts) ·
//   practicing (🔵 Practicing Questions) · revising (🟠 Revision Started)
// System-controlled state (never a self-report option):
//   exam_ready (🟢) — earned through confidence signals (applyConfidenceSignal
//   below), mock evidence, and revision discipline.
// "Revision DUE" is DERIVED (practicing/revising/exam_ready + past the
// topic's revision cadence), never stored — see prep-memory's revisionOverdue.
export type CoverageStatus = 'not_started' | 'learning' | 'practicing' | 'revising' | 'exam_ready';

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
  // "Start my preparation with <cluster>" — the student's chosen opening
  // cluster (e.g. Arithmetic). A steady bias, not an override: prerequisites
  // and revision-due still apply, so ownership never breaks sequencing.
  focusBonus?: boolean;
  // The student swapped this topic OUT of yesterday's plan. Product rule:
  // never delete, always postpone — +40 makes its return tomorrow all but
  // guaranteed, so a swap can never quietly lose work.
  postponedBonus?: boolean;
}

export interface TopicChoice {
  topic: string;
  score: number;
  reasons: string[];
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
export function chooseTopicForSection(candidates: TopicCandidateInput[], revisionMultiplier = 1, revisionSeason = false): TopicChoice {
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
      revisionPoints = overdue * (revisionSeason ? 6 : 3);
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

    const postponedPoints = c.postponedBonus ? 40 : 0;
    if (c.postponedBonus) reasons.unshift("Back from yesterday's swap");

    const score = coveragePoints + weightagePoints + sequencePoints + revisionPoints + prereqPenalty + selfReportPoints + priorityPoints + focusPoints + postponedPoints;
    return { topic: c.topic, score, reasons };
  });

  scored.sort((a, b) => b.score - a.score);
  const winner = scored[0];
  const winnerCand = candidates.find((c) => c.topic === winner.topic)!;
  // The chosen topic leads with the expert "why"; keep a secondary keyword reason.
  const why = expertWhy(winnerCand, revisionMultiplier);
  return { topic: winner.topic, score: winner.score, reasons: [why, ...winner.reasons].slice(0, 2) };
}

export type ConfidenceSignal = 'green' | 'blue' | 'yellow' | 'red';

const STATUS_ORDER: CoverageStatus[] = ['not_started', 'learning', 'practicing', 'revising', 'exam_ready'];
const PRACTICING_RANK = STATUS_ORDER.indexOf('practicing');

// Confidence-aware planning — this is where "CareerRai upgrades topics
// automatically" lives: the student declares up to 'revising' in the
// Blueprint; 'exam_ready' is EARNED here, from a green tap on a topic
// already at 'revising'. Signals feed the same Coverage grid the Topic
// Selector reads for tomorrow's plan.
//   green   — advance one level, up to and including 'exam_ready'
//   blue    — real progress, not full confidence yet: advance one level but
//             capped at 'practicing' — never pushes a topic into 'revising'
//             or 'exam_ready' off a "getting there" tap, only green does that
//   yellow  — acknowledges the attempt; only moves an untouched topic to
//             'learning', never advances or regresses one already in progress
//   red     — a real regression signal: struggling on a topic at
//             'practicing'/'revising'/'exam_ready' means it isn't holding, so
//             it drops back to 'learning' — never all the way to
//             'not_started', since the attempt itself is still real signal
export function applyConfidenceSignal(current: CoverageStatus | null, confidence: ConfidenceSignal): CoverageStatus {
  const rank = STATUS_ORDER.indexOf(current ?? 'not_started');
  if (confidence === 'green') return STATUS_ORDER[Math.min(rank + 1, STATUS_ORDER.length - 1)];
  if (confidence === 'blue') return STATUS_ORDER[rank >= PRACTICING_RANK ? rank : rank + 1];
  if (confidence === 'red') return 'learning';
  return rank === 0 ? 'learning' : STATUS_ORDER[rank];
}
