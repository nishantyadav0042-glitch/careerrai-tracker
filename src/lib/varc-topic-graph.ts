// VARC Topic Graph — built from the founder's LID, but deliberately NOT a
// straight transcription. VARC is structurally different from QA/DILR, and the
// founder + research agreed on the reshape:
//
//   - The pure SKILLS in the LID (Main Idea, Inference, Tone, Purpose,
//     Fact-vs-Opinion, Assumption, Strengthen/Weaken, Conclusion, RC Strategy)
//     are NOT standalone study topics — nobody practices "inference-only" sets;
//     you build them BY doing RC/CR. They live in RC_SKILLS below as tracked
//     DIMENSIONS (Phase 2 behaviour signals), never scheduled topics.
//   - The practiceable UNITS coaching/sources actually give — RC passages (by
//     DOMAIN, which also builds domain vocab), the four VA question types, and
//     standalone Critical Reasoning sets — ARE the topics that get a climb.
//   - Same conventions as QA/DILR: Mock Exposure dropped (weekly mocks are
//     separate from August); 5-stage climb; the LID "Revision: N" →
//     initialRevisionSessions.
//
// Result: 16 topics = RC Fundamentals + 10 RC domains + 4 VA types + Critical
// Reasoning. Bonus = the 2 rarest RC domains (Law & Governance, Sociology &
// Culture). All session/difficulty numbers are priors to calibrate against our
// own students' data.

export type VarcCluster = 'Reading Comprehension' | 'Verbal Ability' | 'Critical Reasoning';
export type VarcStage = 'concept' | 'easy' | 'medium' | 'hard' | 'exam_ready';
export const VARC_STAGE_ORDER: VarcStage[] = ['concept', 'easy', 'medium', 'hard', 'exam_ready'];

export interface VarcSessionCounts { concept: number; easy: number; medium: number; hard: number; }
export interface VarcTopicSpec {
  topic: string;
  cluster: VarcCluster;
  isBonus: boolean;
  prerequisites: string[];
  weightage: number;
  difficulty: { concept: number; practice: number; retention: number; exam: number };
  sessions: VarcSessionCounts;
  initialRevisionSessions: number;
}

// The RC/CR skills the LID listed as "topics" — kept as TRACKED dimensions,
// measured inside every RC/CR session (Phase 2), never scheduled on their own.
export const RC_SKILLS = [
  'Main Idea', 'Inference', 'Tone & Perspective', 'Purpose & Structure',
  'Fact vs Opinion', 'Assumption', 'Strengthen & Weaken', 'Conclusion', 'Passage Selection',
];

// ── Reading Comprehension (11: fundamentals + 10 domains) ────────────────
// RC Fundamentals carries the heavy concept load (active reading, passage
// mapping); each domain is a practice climb that also builds that domain's
// vocabulary — the founder's "8–10 domains for vast vocab" ask, done the way RC
// is actually practised.
const RC: VarcTopicSpec[] = [
  { topic: 'RC Fundamentals', cluster: 'Reading Comprehension', isBonus: false, prerequisites: [], weightage: 5,
    difficulty: { concept: 4, practice: 8, retention: 5, exam: 9 }, sessions: { concept: 4, easy: 3, medium: 3, hard: 3 }, initialRevisionSessions: 3 },
  { topic: 'RC · Science & Technology', cluster: 'Reading Comprehension', isBonus: false, prerequisites: ['RC Fundamentals'], weightage: 5,
    difficulty: { concept: 4, practice: 8, retention: 5, exam: 8 }, sessions: { concept: 1, easy: 2, medium: 2, hard: 2 }, initialRevisionSessions: 1 },
  { topic: 'RC · Economics & Business', cluster: 'Reading Comprehension', isBonus: false, prerequisites: ['RC Fundamentals'], weightage: 5,
    difficulty: { concept: 4, practice: 8, retention: 5, exam: 8 }, sessions: { concept: 1, easy: 2, medium: 2, hard: 2 }, initialRevisionSessions: 1 },
  { topic: 'RC · Philosophy & Psychology', cluster: 'Reading Comprehension', isBonus: false, prerequisites: ['RC Fundamentals'], weightage: 5,
    difficulty: { concept: 5, practice: 9, retention: 6, exam: 9 }, sessions: { concept: 1, easy: 2, medium: 3, hard: 2 }, initialRevisionSessions: 1 },
  { topic: 'RC · History & Politics', cluster: 'Reading Comprehension', isBonus: false, prerequisites: ['RC Fundamentals'], weightage: 4,
    difficulty: { concept: 4, practice: 8, retention: 5, exam: 8 }, sessions: { concept: 1, easy: 2, medium: 2, hard: 2 }, initialRevisionSessions: 1 },
  { topic: 'RC · Literature & Arts', cluster: 'Reading Comprehension', isBonus: false, prerequisites: ['RC Fundamentals'], weightage: 4,
    difficulty: { concept: 4, practice: 8, retention: 5, exam: 8 }, sessions: { concept: 1, easy: 2, medium: 2, hard: 2 }, initialRevisionSessions: 1 },
  { topic: 'RC · AI & Data', cluster: 'Reading Comprehension', isBonus: false, prerequisites: ['RC Fundamentals'], weightage: 4,
    difficulty: { concept: 4, practice: 8, retention: 5, exam: 8 }, sessions: { concept: 1, easy: 2, medium: 2, hard: 2 }, initialRevisionSessions: 1 },
  { topic: 'RC · Medicine & Health', cluster: 'Reading Comprehension', isBonus: false, prerequisites: ['RC Fundamentals'], weightage: 4,
    difficulty: { concept: 4, practice: 8, retention: 5, exam: 8 }, sessions: { concept: 1, easy: 2, medium: 2, hard: 2 }, initialRevisionSessions: 1 },
  { topic: 'RC · Environment & Ecology', cluster: 'Reading Comprehension', isBonus: false, prerequisites: ['RC Fundamentals'], weightage: 4,
    difficulty: { concept: 4, practice: 8, retention: 5, exam: 8 }, sessions: { concept: 1, easy: 2, medium: 2, hard: 2 }, initialRevisionSessions: 1 },
  // Bonus domains — genuinely rarer in recent CAT; offered opt-in.
  { topic: 'RC · Sociology & Culture', cluster: 'Reading Comprehension', isBonus: true, prerequisites: ['RC Fundamentals'], weightage: 3,
    difficulty: { concept: 4, practice: 8, retention: 5, exam: 8 }, sessions: { concept: 1, easy: 2, medium: 2, hard: 2 }, initialRevisionSessions: 1 },
  { topic: 'RC · Law & Governance', cluster: 'Reading Comprehension', isBonus: true, prerequisites: ['RC Fundamentals'], weightage: 3,
    difficulty: { concept: 4, practice: 8, retention: 5, exam: 8 }, sessions: { concept: 1, easy: 2, medium: 2, hard: 2 }, initialRevisionSessions: 1 },
];

// ── Verbal Ability (4 discrete question types) ───────────────────────────
const VA: VarcTopicSpec[] = [
  { topic: 'Para Jumbles', cluster: 'Verbal Ability', isBonus: false, prerequisites: [], weightage: 5,
    difficulty: { concept: 5, practice: 8, retention: 6, exam: 9 }, sessions: { concept: 2, easy: 3, medium: 4, hard: 5 }, initialRevisionSessions: 2 },
  { topic: 'Para Summary', cluster: 'Verbal Ability', isBonus: false, prerequisites: [], weightage: 5,
    difficulty: { concept: 4, practice: 7, retention: 5, exam: 8 }, sessions: { concept: 2, easy: 3, medium: 4, hard: 4 }, initialRevisionSessions: 2 },
  { topic: 'Sentence Insertion', cluster: 'Verbal Ability', isBonus: false, prerequisites: [], weightage: 5,
    difficulty: { concept: 5, practice: 8, retention: 5, exam: 8 }, sessions: { concept: 2, easy: 3, medium: 4, hard: 4 }, initialRevisionSessions: 2 },
  { topic: 'Odd Sentence Out', cluster: 'Verbal Ability', isBonus: false, prerequisites: [], weightage: 4,
    difficulty: { concept: 4, practice: 7, retention: 5, exam: 8 }, sessions: { concept: 2, easy: 3, medium: 3, hard: 4 }, initialRevisionSessions: 2 },
];

// ── Critical Reasoning (standalone practice — CR sets exist) ──────────────
const CR: VarcTopicSpec[] = [
  { topic: 'Critical Reasoning', cluster: 'Critical Reasoning', isBonus: false, prerequisites: [], weightage: 4,
    difficulty: { concept: 6, practice: 8, retention: 6, exam: 9 }, sessions: { concept: 3, easy: 3, medium: 4, hard: 5 }, initialRevisionSessions: 2 },
];

export const VARC_TOPICS: VarcTopicSpec[] = [...RC, ...VA, ...CR];
export const VARC_TOPICS_BY_NAME: Map<string, VarcTopicSpec> = new Map(VARC_TOPICS.map((t) => [t.topic, t]));
export const VARC_CLUSTERS: VarcCluster[] = ['Reading Comprehension', 'Verbal Ability', 'Critical Reasoning'];
export const VARC_CORE_TOPICS = VARC_TOPICS.filter((t) => !t.isBonus);
export const VARC_BONUS_TOPICS = VARC_TOPICS.filter((t) => t.isBonus);
