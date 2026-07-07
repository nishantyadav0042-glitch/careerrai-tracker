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

import { TOPIC_METADATA } from './topics-constants';

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
}

export interface TopicChoice {
  topic: string;
  score: number;
  reasons: string[];
}

// Coverage status maps to points the same way everywhere it appears — a
// topic nobody has looked at yet (or never logged in the Matrix) leads;
// something already "strong" only wins if it's genuinely revision-overdue.
const COVERAGE_POINTS: Record<CoverageStatus | 'unknown', number> = {
  unknown: 26,
  not_started: 30,
  learning: 20,
  practicing: 10,
  revising: 6,
  exam_ready: 2,
};

// Elder-sibling language, not analytics: the reason should read like
// someone protecting your preparation, not a database annotation. Every
// number in these strings is still real.
function coverageReason(topic: string, status: CoverageStatus | null): string | null {
  if (status == null) return `${topic} isn't on your map yet — today puts it there`;
  if (status === 'not_started') return `you haven't started ${topic} — today is the cheapest it will ever be`;
  if (status === 'learning') return `you're mid-way through ${topic} — finish the idea while it's warm`;
  return null; // practicing/revising/exam_ready only explained via revision-due below, not coverage alone
}

// revisionMultiplier: the archetype coefficient from
// routine-engine.ts's archetypeRevisionMultiplier() — a repeater's cycle
// tightens (<1), a working professional's loosens (>1), applied to every
// topic's revisionFrequencyDays before checking overdue, not a separate
// rule per archetype.
export function chooseTopicForSection(candidates: TopicCandidateInput[], revisionMultiplier = 1): TopicChoice {
  const scored = candidates.map((c) => {
    const meta = TOPIC_METADATA[c.topic];
    const reasons: string[] = [];

    const coveragePoints = COVERAGE_POINTS[c.coverageStatus ?? 'unknown'];
    const covReason = coverageReason(c.topic, c.coverageStatus);
    if (covReason) reasons.push(covReason);

    const weightagePoints = (meta?.weightage ?? 3) * 3; // 3–15

    let revisionPoints = 0;
    if (meta && c.daysSinceLastPracticed != null) {
      const adjustedFrequency = meta.revisionFrequencyDays * revisionMultiplier;
      const overdue = Math.min(Math.max(c.daysSinceLastPracticed - adjustedFrequency, 0), 10);
      revisionPoints = overdue * 3;
      if (overdue > 0) reasons.push(`you've ignored ${c.topic} for ${c.daysSinceLastPracticed} day${c.daysSinceLastPracticed === 1 ? '' : 's'} — skip today and it starts fading`);
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
    if (c.selfReportedBonus) reasons.push(`${c.topic} is what you told us was toughest — we didn't forget`);

    const score = coveragePoints + weightagePoints + revisionPoints + prereqPenalty + selfReportPoints;
    return { topic: c.topic, score, reasons };
  });

  scored.sort((a, b) => b.score - a.score);
  const winner = scored[0];
  return { topic: winner.topic, score: winner.score, reasons: winner.reasons.slice(0, 2) };
}

export type ConfidenceSignal = 'green' | 'yellow' | 'red';

const STATUS_ORDER: CoverageStatus[] = ['not_started', 'learning', 'practicing', 'revising', 'exam_ready'];

// Confidence-aware planning — this is where "CareerRai upgrades topics
// automatically" lives: the student declares up to 'revising' in the
// Blueprint; 'exam_ready' is EARNED here, from a green tap on a topic
// already at 'revising'. Signals feed the same Coverage grid the Topic
// Selector reads for tomorrow's plan.
//   green  — advance one level, up to and including 'exam_ready'
//   yellow — acknowledges the attempt; only moves an untouched topic to
//            'learning', never advances or regresses one already in progress
//   red    — a real regression signal: struggling on a topic at
//            'practicing'/'revising'/'exam_ready' means it isn't holding, so
//            it drops back to 'learning' — never all the way to
//            'not_started', since the attempt itself is still real signal
export function applyConfidenceSignal(current: CoverageStatus | null, confidence: ConfidenceSignal): CoverageStatus {
  const rank = STATUS_ORDER.indexOf(current ?? 'not_started');
  if (confidence === 'green') return STATUS_ORDER[Math.min(rank + 1, STATUS_ORDER.length - 1)];
  if (confidence === 'red') return 'learning';
  return rank === 0 ? 'learning' : STATUS_ORDER[rank];
}
