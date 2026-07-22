// QA Topic Graph — the founder's Learning Intelligence Database (LID),
// transcribed faithfully from real per-topic research (22 Jul), not estimated.
//
// This SUPERSEDES the flat QA entries in topics-constants.ts's TOPIC_METADATA
// for planning purposes — that file stays as the display/legacy graph other
// screens read; this is the richer per-topic model Section C's engine runs on.
// VARC and DILR get their own equivalent files once the founder shares that
// research (his own words: "I will share others as well").
//
// Two founder corrections baked in here, deliberately different from the raw
// LID text:
//   1. "Mock Exposure" is DROPPED as a per-topic session type — real mocks are
//      a separate, weekly, full-syllabus cadence starting the first week of
//      August, not something one topic owns.
//   2. Stage order is Concept → Easy → Medium → Hard → Exam Ready, THEN
//      Revision — revision is a post-mastery consolidation + ongoing decay
//      cycle, never a stage a topic passes through on the way UP. The LID's
//      per-topic "Revision: N sessions" number is kept as `initialRevisionSessions`
//      — a short reinforcement burst right after a topic first reaches Exam
//      Ready — after which the topic enters the ongoing decay-triggered
//      revision cycle (see qa-mastery-engine.ts's revisionDue()).

export type QaCluster = 'Arithmetic' | 'Algebra' | 'Geometry' | 'Number System' | 'Modern Math';

// The five REAL climbing stages a topic moves through. Revision is not a
// stored stage — see the file header.
export type QaStage = 'concept' | 'easy' | 'medium' | 'hard' | 'exam_ready';
export const QA_STAGE_ORDER: QaStage[] = ['concept', 'easy', 'medium', 'hard', 'exam_ready'];

export interface QaSessionCounts {
  concept: number;
  easy: number;
  medium: number;
  hard: number;
  // 'exam_ready' is the destination, not a session-bearing stage.
}

export interface QaTopicSpec {
  topic: string;
  cluster: QaCluster;
  // The founder's research-backed bonus-7: declining relevance or a direct
  // application of a core topic already mastered. Offered opt-in, never
  // silently dropped from the graph.
  isBonus: boolean;
  prerequisites: string[];
  weightage: number; // 1-5, CAT marks importance (from the LID's star rating)
  difficulty: { concept: number; practice: number; retention: number; exam: number }; // 1-10 each, LID as-is
  sessions: QaSessionCounts;
  // The LID's "Revision: N sessions" — repurposed as the consolidation burst
  // right after first reaching Exam Ready (see file header, correction #2).
  initialRevisionSessions: number;
}

// ── Arithmetic (15) ──────────────────────────────────────────────────────
const ARITHMETIC: QaTopicSpec[] = [
  { topic: 'Percentages', cluster: 'Arithmetic', isBonus: false, prerequisites: [], weightage: 5,
    difficulty: { concept: 3, practice: 5, retention: 4, exam: 6 },
    sessions: { concept: 2, easy: 2, medium: 3, hard: 2 }, initialRevisionSessions: 2 },
  { topic: 'Ratio & Proportion', cluster: 'Arithmetic', isBonus: false, prerequisites: [], weightage: 5,
    difficulty: { concept: 4, practice: 6, retention: 5, exam: 7 },
    sessions: { concept: 2, easy: 2, medium: 3, hard: 3 }, initialRevisionSessions: 2 },
  { topic: 'Average', cluster: 'Arithmetic', isBonus: false, prerequisites: ['Ratio & Proportion'], weightage: 4,
    difficulty: { concept: 3, practice: 5, retention: 4, exam: 6 },
    sessions: { concept: 2, easy: 2, medium: 3, hard: 2 }, initialRevisionSessions: 2 },
  { topic: 'Profit & Loss', cluster: 'Arithmetic', isBonus: false, prerequisites: ['Percentages'], weightage: 5,
    difficulty: { concept: 4, practice: 6, retention: 5, exam: 7 },
    sessions: { concept: 2, easy: 2, medium: 4, hard: 3 }, initialRevisionSessions: 2 },
  { topic: 'SI & CI', cluster: 'Arithmetic', isBonus: false, prerequisites: ['Profit & Loss'], weightage: 4,
    difficulty: { concept: 5, practice: 6, retention: 5, exam: 7 },
    sessions: { concept: 2, easy: 2, medium: 3, hard: 3 }, initialRevisionSessions: 2 },
  { topic: 'Mixtures', cluster: 'Arithmetic', isBonus: false, prerequisites: ['Ratio & Proportion', 'Average'], weightage: 4,
    difficulty: { concept: 5, practice: 7, retention: 6, exam: 7 },
    sessions: { concept: 2, easy: 2, medium: 4, hard: 3 }, initialRevisionSessions: 2 },
  { topic: 'Partnership', cluster: 'Arithmetic', isBonus: true, prerequisites: ['Ratio & Proportion', 'Mixtures'], weightage: 2,
    difficulty: { concept: 3, practice: 5, retention: 4, exam: 5 },
    sessions: { concept: 1, easy: 2, medium: 2, hard: 2 }, initialRevisionSessions: 1 },
  { topic: 'Time & Work', cluster: 'Arithmetic', isBonus: false, prerequisites: ['Ratio & Proportion'], weightage: 5,
    difficulty: { concept: 5, practice: 8, retention: 6, exam: 8 },
    sessions: { concept: 2, easy: 2, medium: 4, hard: 4 }, initialRevisionSessions: 2 },
  { topic: 'Pipes & Cisterns', cluster: 'Arithmetic', isBonus: true, prerequisites: ['Time & Work'], weightage: 2,
    difficulty: { concept: 3, practice: 5, retention: 4, exam: 5 },
    sessions: { concept: 1, easy: 2, medium: 2, hard: 2 }, initialRevisionSessions: 1 },
  { topic: 'Time Speed Distance', cluster: 'Arithmetic', isBonus: false, prerequisites: ['Ratio & Proportion'], weightage: 5,
    difficulty: { concept: 4, practice: 8, retention: 6, exam: 8 },
    sessions: { concept: 2, easy: 2, medium: 4, hard: 4 }, initialRevisionSessions: 2 },
  { topic: 'Boats & Streams', cluster: 'Arithmetic', isBonus: true, prerequisites: ['Time Speed Distance'], weightage: 2,
    difficulty: { concept: 3, practice: 5, retention: 4, exam: 5 },
    sessions: { concept: 1, easy: 2, medium: 2, hard: 2 }, initialRevisionSessions: 1 },
  { topic: 'Relative Speed', cluster: 'Arithmetic', isBonus: false, prerequisites: ['Time Speed Distance'], weightage: 4,
    difficulty: { concept: 4, practice: 6, retention: 5, exam: 7 },
    sessions: { concept: 1, easy: 2, medium: 3, hard: 2 }, initialRevisionSessions: 1 },
  { topic: 'Races', cluster: 'Arithmetic', isBonus: true, prerequisites: ['Relative Speed'], weightage: 1,
    difficulty: { concept: 3, practice: 4, retention: 3, exam: 4 },
    sessions: { concept: 1, easy: 1, medium: 2, hard: 1 }, initialRevisionSessions: 1 },
  { topic: 'Clocks & Calendars', cluster: 'Arithmetic', isBonus: true, prerequisites: [], weightage: 1,
    difficulty: { concept: 4, practice: 3, retention: 4, exam: 3 },
    sessions: { concept: 1, easy: 1, medium: 1, hard: 1 }, initialRevisionSessions: 1 },
  { topic: 'Escalators', cluster: 'Arithmetic', isBonus: true, prerequisites: ['Time Speed Distance', 'Relative Speed'], weightage: 2,
    difficulty: { concept: 5, practice: 6, retention: 5, exam: 7 },
    sessions: { concept: 1, easy: 1, medium: 2, hard: 2 }, initialRevisionSessions: 1 },
];

// ── Algebra (9 detailed in the LID; founder's own summary said 10 — flagged
// below, not guessed) ────────────────────────────────────────────────────
const ALGEBRA: QaTopicSpec[] = [
  { topic: 'Linear Equations', cluster: 'Algebra', isBonus: false, prerequisites: [], weightage: 4,
    difficulty: { concept: 4, practice: 6, retention: 5, exam: 7 },
    sessions: { concept: 2, easy: 2, medium: 3, hard: 3 }, initialRevisionSessions: 2 },
  { topic: 'Quadratic Equations', cluster: 'Algebra', isBonus: false, prerequisites: ['Linear Equations'], weightage: 5,
    difficulty: { concept: 6, practice: 7, retention: 6, exam: 8 },
    sessions: { concept: 3, easy: 2, medium: 4, hard: 3 }, initialRevisionSessions: 2 },
  { topic: 'Inequalities', cluster: 'Algebra', isBonus: false, prerequisites: ['Quadratic Equations'], weightage: 5,
    difficulty: { concept: 6, practice: 7, retention: 6, exam: 8 },
    sessions: { concept: 3, easy: 2, medium: 4, hard: 3 }, initialRevisionSessions: 2 },
  { topic: 'Functions', cluster: 'Algebra', isBonus: false, prerequisites: ['Quadratic Equations'], weightage: 3,
    difficulty: { concept: 7, practice: 6, retention: 6, exam: 7 },
    sessions: { concept: 3, easy: 2, medium: 3, hard: 3 }, initialRevisionSessions: 2 },
  { topic: 'Surds & Indices', cluster: 'Algebra', isBonus: false, prerequisites: [], weightage: 3,
    difficulty: { concept: 5, practice: 5, retention: 4, exam: 6 },
    sessions: { concept: 2, easy: 2, medium: 3, hard: 2 }, initialRevisionSessions: 2 },
  { topic: 'Logarithms', cluster: 'Algebra', isBonus: false, prerequisites: ['Functions', 'Surds & Indices'], weightage: 4,
    difficulty: { concept: 7, practice: 7, retention: 6, exam: 8 },
    sessions: { concept: 3, easy: 2, medium: 4, hard: 3 }, initialRevisionSessions: 2 },
  { topic: 'Polynomials', cluster: 'Algebra', isBonus: false, prerequisites: ['Quadratic Equations'], weightage: 3,
    difficulty: { concept: 6, practice: 6, retention: 5, exam: 7 },
    sessions: { concept: 2, easy: 2, medium: 3, hard: 3 }, initialRevisionSessions: 2 },
  { topic: 'Progressions', cluster: 'Algebra', isBonus: false, prerequisites: ['Logarithms'], weightage: 4,
    difficulty: { concept: 6, practice: 7, retention: 6, exam: 8 },
    sessions: { concept: 3, easy: 2, medium: 4, hard: 3 }, initialRevisionSessions: 2 },
  { topic: 'Maxima & Minima', cluster: 'Algebra', isBonus: false, prerequisites: ['Quadratic Equations', 'Functions', 'Inequalities'], weightage: 4,
    difficulty: { concept: 7, practice: 7, retention: 6, exam: 8 },
    sessions: { concept: 3, easy: 2, medium: 4, hard: 3 }, initialRevisionSessions: 2 },
];

// ── Geometry & Mensuration (6) ───────────────────────────────────────────
const GEOMETRY: QaTopicSpec[] = [
  { topic: 'Lines & Angles', cluster: 'Geometry', isBonus: false, prerequisites: [], weightage: 2,
    difficulty: { concept: 4, practice: 5, retention: 5, exam: 6 },
    sessions: { concept: 2, easy: 2, medium: 2, hard: 2 }, initialRevisionSessions: 2 },
  { topic: 'Triangles', cluster: 'Geometry', isBonus: false, prerequisites: ['Lines & Angles'], weightage: 5,
    difficulty: { concept: 6, practice: 7, retention: 6, exam: 8 },
    sessions: { concept: 3, easy: 2, medium: 4, hard: 4 }, initialRevisionSessions: 2 },
  { topic: 'Quadrilaterals & Polygons', cluster: 'Geometry', isBonus: false, prerequisites: ['Triangles'], weightage: 3,
    difficulty: { concept: 5, practice: 6, retention: 5, exam: 7 },
    sessions: { concept: 2, easy: 2, medium: 3, hard: 3 }, initialRevisionSessions: 2 },
  { topic: 'Circles', cluster: 'Geometry', isBonus: false, prerequisites: ['Triangles'], weightage: 5,
    difficulty: { concept: 7, practice: 8, retention: 6, exam: 8 },
    sessions: { concept: 3, easy: 2, medium: 4, hard: 4 }, initialRevisionSessions: 2 },
  { topic: 'Coordinate Geometry', cluster: 'Geometry', isBonus: false, prerequisites: ['Lines & Angles', 'Triangles'], weightage: 3,
    difficulty: { concept: 5, practice: 6, retention: 5, exam: 6 },
    sessions: { concept: 3, easy: 2, medium: 3, hard: 2 }, initialRevisionSessions: 2 },
  { topic: 'Mensuration', cluster: 'Geometry', isBonus: false, prerequisites: ['Circles', 'Quadrilaterals & Polygons'], weightage: 5,
    difficulty: { concept: 5, practice: 6, retention: 5, exam: 7 },
    sessions: { concept: 3, easy: 2, medium: 4, hard: 3 }, initialRevisionSessions: 2 },
];

// ── Number System (7) ────────────────────────────────────────────────────
// NOTE: 'Divisibility' (the founder's Topic 32) was not given a full LID card
// in what was shared — the list jumped from Topic 31 to Topic 33. Its numbers
// below are carried over from the product's EXISTING topics-constants.ts
// metadata (difficulty 3, ~6h ≈ 10 sessions at the ~35min/session average),
// distributed across stages consistently with sibling Number System topics.
// Flagged for the founder to correct once the real card is shared.
const NUMBER_SYSTEM: QaTopicSpec[] = [
  { topic: 'Number Properties', cluster: 'Number System', isBonus: false, prerequisites: [], weightage: 3,
    difficulty: { concept: 4, practice: 5, retention: 4, exam: 6 },
    sessions: { concept: 2, easy: 2, medium: 3, hard: 2 }, initialRevisionSessions: 2 },
  { topic: 'Divisibility', cluster: 'Number System', isBonus: false, prerequisites: ['Number Properties'], weightage: 2,
    difficulty: { concept: 3, practice: 5, retention: 4, exam: 6 },
    sessions: { concept: 2, easy: 2, medium: 3, hard: 2 }, initialRevisionSessions: 1 }, // ⚠ estimated, see note above
  { topic: 'HCF & LCM', cluster: 'Number System', isBonus: false, prerequisites: ['Divisibility'], weightage: 5,
    difficulty: { concept: 5, practice: 6, retention: 5, exam: 7 },
    sessions: { concept: 2, easy: 2, medium: 3, hard: 3 }, initialRevisionSessions: 2 },
  { topic: 'Remainders', cluster: 'Number System', isBonus: false, prerequisites: ['HCF & LCM'], weightage: 5,
    difficulty: { concept: 7, practice: 8, retention: 6, exam: 8 },
    sessions: { concept: 3, easy: 2, medium: 4, hard: 4 }, initialRevisionSessions: 2 },
  { topic: 'Cyclicity & Unit Digit', cluster: 'Number System', isBonus: false, prerequisites: ['Remainders'], weightage: 4,
    difficulty: { concept: 5, practice: 6, retention: 5, exam: 7 },
    sessions: { concept: 2, easy: 2, medium: 3, hard: 2 }, initialRevisionSessions: 2 },
  { topic: 'Factorials & Trailing Zeroes', cluster: 'Number System', isBonus: false, prerequisites: ['Remainders', 'Cyclicity & Unit Digit'], weightage: 4,
    difficulty: { concept: 6, practice: 7, retention: 5, exam: 7 },
    sessions: { concept: 2, easy: 2, medium: 3, hard: 3 }, initialRevisionSessions: 2 },
  { topic: 'Base Systems', cluster: 'Number System', isBonus: true, prerequisites: ['Factorials & Trailing Zeroes'], weightage: 2,
    difficulty: { concept: 6, practice: 5, retention: 5, exam: 6 },
    sessions: { concept: 2, easy: 1, medium: 2, hard: 2 }, initialRevisionSessions: 1 },
];

// ── Modern Mathematics (3) ───────────────────────────────────────────────
const MODERN_MATH: QaTopicSpec[] = [
  { topic: 'Permutation & Combination', cluster: 'Modern Math', isBonus: false, prerequisites: ['Factorials & Trailing Zeroes'], weightage: 2,
    difficulty: { concept: 7, practice: 8, retention: 6, exam: 8 },
    sessions: { concept: 3, easy: 2, medium: 4, hard: 4 }, initialRevisionSessions: 2 },
  { topic: 'Probability', cluster: 'Modern Math', isBonus: false, prerequisites: ['Permutation & Combination'], weightage: 2,
    difficulty: { concept: 7, practice: 8, retention: 6, exam: 8 },
    sessions: { concept: 3, easy: 2, medium: 4, hard: 4 }, initialRevisionSessions: 2 },
  { topic: 'Set Theory & Venn Diagrams', cluster: 'Modern Math', isBonus: false, prerequisites: ['Probability'], weightage: 1,
    difficulty: { concept: 5, practice: 6, retention: 5, exam: 7 },
    sessions: { concept: 2, easy: 2, medium: 3, hard: 3 }, initialRevisionSessions: 2 },
];

export const QA_TOPICS: QaTopicSpec[] = [...ARITHMETIC, ...ALGEBRA, ...GEOMETRY, ...NUMBER_SYSTEM, ...MODERN_MATH];
export const QA_TOPICS_BY_NAME: Map<string, QaTopicSpec> = new Map(QA_TOPICS.map((t) => [t.topic, t]));
export const QA_CLUSTERS: QaCluster[] = ['Arithmetic', 'Algebra', 'Geometry', 'Number System', 'Modern Math'];
export const QA_CORE_TOPICS = QA_TOPICS.filter((t) => !t.isBonus);
export const QA_BONUS_TOPICS = QA_TOPICS.filter((t) => t.isBonus);
