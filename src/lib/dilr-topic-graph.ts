// DILR Topic Graph — the founder's Learning Intelligence Database for Data
// Interpretation & Logical Reasoning, transcribed topic-by-topic (22 Jul), the
// same pattern as qa-topic-graph.ts.
//
// Same conventions as QA, deliberately:
//   1. "Mock Exposure" is DROPPED as a per-topic session type — real mocks are
//      a separate weekly full-syllabus cadence from August.
//   2. Stage order is Concept → Easy → Medium → Hard → Exam Ready, THEN
//      Revision. The LID's "Revision: N sessions" becomes initialRevisionSessions,
//      a post-mastery consolidation burst.
//   3. Bonus concept applied research-honestly (founder: base it on the 5–7yr
//      pattern). DILR has FEWER low-value topics than QA — almost everything is
//      4–5★ and TRENDING UP (modern CAT is dominated by hybrid DI-LR sets). The
//      single genuinely fading topic is Data Sufficiency: the LID grades it
//      "Declining as a standalone format" and public 5-year analyses show CAT
//      DILR moved to integrated set-based formats where standalone DS is rare.
//      So DS is the only bonus — not forced to a QA-like count.
//
// Founder decisions applied (22 Jul):
//   - "Networks & Routes" and the overlapping "Routes & Paths" cards MERGED
//     into one core topic, Networks & Routes (it covers route/path reasoning).
//   - 18 topics total (7 DI + 9 LR + 2 Integrated) after the merge.
//   - Prerequisites reflect TRUE build-dependencies (charts before Mixed,
//     Linear→Circular→Seating), not the LID's longer suggested study order, so
//     the plan keeps sensible parallelism and never gates a core topic behind a
//     bonus one.

export type DilrCluster = 'Data Interpretation' | 'Logical Reasoning' | 'Integrated';

// Same five climbing stages as QA. Revision is not a stored stage.
export type DilrStage = 'concept' | 'easy' | 'medium' | 'hard' | 'exam_ready';
export const DILR_STAGE_ORDER: DilrStage[] = ['concept', 'easy', 'medium', 'hard', 'exam_ready'];

export interface DilrSessionCounts { concept: number; easy: number; medium: number; hard: number; }

export interface DilrTopicSpec {
  topic: string;
  cluster: DilrCluster;
  isBonus: boolean;
  prerequisites: string[];
  weightage: number; // 1-5, from the LID importance stars
  difficulty: { concept: number; practice: number; retention: number; exam: number }; // 1-10, LID as-is
  sessions: DilrSessionCounts;
  initialRevisionSessions: number; // the LID's "Revision: N sessions", post-mastery
}

// ── Data Interpretation (7) ──────────────────────────────────────────────
const DI: DilrTopicSpec[] = [
  { topic: 'Tables', cluster: 'Data Interpretation', isBonus: false, prerequisites: [], weightage: 5,
    difficulty: { concept: 3, practice: 7, retention: 4, exam: 8 }, sessions: { concept: 1, easy: 2, medium: 4, hard: 4 }, initialRevisionSessions: 2 },
  { topic: 'Bar Charts', cluster: 'Data Interpretation', isBonus: false, prerequisites: ['Tables'], weightage: 4,
    difficulty: { concept: 3, practice: 7, retention: 4, exam: 7 }, sessions: { concept: 1, easy: 2, medium: 3, hard: 4 }, initialRevisionSessions: 2 },
  { topic: 'Line Graphs', cluster: 'Data Interpretation', isBonus: false, prerequisites: ['Tables'], weightage: 4,
    difficulty: { concept: 3, practice: 6, retention: 4, exam: 7 }, sessions: { concept: 1, easy: 2, medium: 3, hard: 4 }, initialRevisionSessions: 2 },
  { topic: 'Pie Charts', cluster: 'Data Interpretation', isBonus: false, prerequisites: ['Tables'], weightage: 4,
    difficulty: { concept: 3, practice: 6, retention: 4, exam: 7 }, sessions: { concept: 1, easy: 2, medium: 3, hard: 4 }, initialRevisionSessions: 2 },
  { topic: 'Mixed Graphs', cluster: 'Data Interpretation', isBonus: false, prerequisites: ['Bar Charts', 'Line Graphs', 'Pie Charts'], weightage: 5,
    difficulty: { concept: 5, practice: 8, retention: 5, exam: 9 }, sessions: { concept: 2, easy: 2, medium: 4, hard: 5 }, initialRevisionSessions: 2 },
  { topic: 'DI Caselets', cluster: 'Data Interpretation', isBonus: false, prerequisites: ['Tables'], weightage: 5,
    difficulty: { concept: 5, practice: 8, retention: 5, exam: 9 }, sessions: { concept: 2, easy: 2, medium: 4, hard: 5 }, initialRevisionSessions: 2 },
  { topic: 'Data Sufficiency', cluster: 'Data Interpretation', isBonus: true, prerequisites: ['DI Caselets'], weightage: 3,
    difficulty: { concept: 6, practice: 6, retention: 5, exam: 6 }, sessions: { concept: 2, easy: 2, medium: 2, hard: 2 }, initialRevisionSessions: 1 },
];

// ── Logical Reasoning (10) ───────────────────────────────────────────────
const LR: DilrTopicSpec[] = [
  { topic: 'Linear Arrangements', cluster: 'Logical Reasoning', isBonus: false, prerequisites: [], weightage: 5,
    difficulty: { concept: 5, practice: 8, retention: 5, exam: 9 }, sessions: { concept: 2, easy: 2, medium: 4, hard: 5 }, initialRevisionSessions: 2 },
  { topic: 'Circular Arrangements', cluster: 'Logical Reasoning', isBonus: false, prerequisites: ['Linear Arrangements'], weightage: 5,
    difficulty: { concept: 6, practice: 8, retention: 6, exam: 9 }, sessions: { concept: 2, easy: 2, medium: 4, hard: 5 }, initialRevisionSessions: 2 },
  { topic: 'Seating Arrangements', cluster: 'Logical Reasoning', isBonus: false, prerequisites: ['Circular Arrangements'], weightage: 5,
    difficulty: { concept: 5, practice: 9, retention: 6, exam: 9 }, sessions: { concept: 2, easy: 3, medium: 4, hard: 5 }, initialRevisionSessions: 2 },
  { topic: 'Distribution & Assignment', cluster: 'Logical Reasoning', isBonus: false, prerequisites: ['Linear Arrangements'], weightage: 5,
    difficulty: { concept: 5, practice: 9, retention: 6, exam: 9 }, sessions: { concept: 2, easy: 2, medium: 4, hard: 5 }, initialRevisionSessions: 2 },
  { topic: 'Scheduling', cluster: 'Logical Reasoning', isBonus: false, prerequisites: ['Distribution & Assignment'], weightage: 5,
    difficulty: { concept: 5, practice: 8, retention: 6, exam: 9 }, sessions: { concept: 2, easy: 2, medium: 4, hard: 5 }, initialRevisionSessions: 2 },
  { topic: 'Games & Tournaments', cluster: 'Logical Reasoning', isBonus: false, prerequisites: ['Distribution & Assignment'], weightage: 5,
    difficulty: { concept: 5, practice: 8, retention: 6, exam: 9 }, sessions: { concept: 2, easy: 2, medium: 4, hard: 5 }, initialRevisionSessions: 2 },
  { topic: 'Binary Logic', cluster: 'Logical Reasoning', isBonus: false, prerequisites: [], weightage: 4,
    difficulty: { concept: 6, practice: 7, retention: 5, exam: 8 }, sessions: { concept: 2, easy: 2, medium: 3, hard: 4 }, initialRevisionSessions: 2 },
  // Networks & Routes — merged with the former "Routes & Paths" card (they
  // overlapped: both are node/edge/path reasoning). One core topic now,
  // covering networks AND route/path deduction.
  { topic: 'Networks & Routes', cluster: 'Logical Reasoning', isBonus: false, prerequisites: ['Distribution & Assignment'], weightage: 4,
    difficulty: { concept: 6, practice: 8, retention: 6, exam: 9 }, sessions: { concept: 2, easy: 2, medium: 4, hard: 5 }, initialRevisionSessions: 2 },
  { topic: 'Ordering & Ranking', cluster: 'Logical Reasoning', isBonus: false, prerequisites: ['Linear Arrangements'], weightage: 5,
    difficulty: { concept: 4, practice: 8, retention: 5, exam: 8 }, sessions: { concept: 2, easy: 2, medium: 4, hard: 5 }, initialRevisionSessions: 2 },
];

// ── Integrated DI-LR (2) ─────────────────────────────────────────────────
const INTEGRATED: DilrTopicSpec[] = [
  { topic: 'Matrix-Based Sets', cluster: 'Integrated', isBonus: false, prerequisites: ['Distribution & Assignment', 'Seating Arrangements'], weightage: 5,
    difficulty: { concept: 6, practice: 9, retention: 6, exam: 9 }, sessions: { concept: 2, easy: 3, medium: 5, hard: 6 }, initialRevisionSessions: 2 },
  { topic: 'Hybrid Puzzle Sets', cluster: 'Integrated', isBonus: false, prerequisites: ['Matrix-Based Sets', 'Games & Tournaments', 'DI Caselets'], weightage: 5,
    difficulty: { concept: 7, practice: 10, retention: 7, exam: 10 }, sessions: { concept: 3, easy: 3, medium: 5, hard: 7 }, initialRevisionSessions: 3 },
];

export const DILR_TOPICS: DilrTopicSpec[] = [...DI, ...LR, ...INTEGRATED];
export const DILR_TOPICS_BY_NAME: Map<string, DilrTopicSpec> = new Map(DILR_TOPICS.map((t) => [t.topic, t]));
export const DILR_CLUSTERS: DilrCluster[] = ['Data Interpretation', 'Logical Reasoning', 'Integrated'];
export const DILR_CORE_TOPICS = DILR_TOPICS.filter((t) => !t.isBonus);
export const DILR_BONUS_TOPICS = DILR_TOPICS.filter((t) => t.isBonus);
