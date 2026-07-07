/**
 * CareerRai's locked Knowledge Graph — the ~56 learning units every engine
 * runs on (Blueprint, Daily Missions, Health, Revision Queue, Buddy Panel,
 * AI explanations). Deliberately capped: adding nodes makes every future
 * engine noisier. Organized by CAT exam sections (VARC / DILR / QA, with QA
 * in five clusters) plus three habit tracks (Mock Preparation / Revision /
 * Reading Habit) that carry no exam-topic metadata but are part of the
 * student's declared preparation map.
 */

// Verbal Ability & Reading Comprehension — 9 units
export const VERBAL_TOPICS = [
  'Reading Comprehension',
  'Para Jumbles',
  'Para Summary',
  'Odd One Out',
  'Sentence Completion',
  'Vocabulary',
  'Grammar',
  'Editorial Reading',
  'Reading Speed Practice',
];

// Data Interpretation & Logical Reasoning — 9 units
export const LRDI_TOPICS = [
  'Tables',
  'Charts',
  'Caselets',
  'Arrangements',
  'Games & Tournaments',
  'Selection & Distribution',
  'Binary Logic',
  'Venn / Sets',
  'Hybrid DILR Sets',
];

// Quantitative Aptitude — 28 units across five clusters. The flat list is
// what section-keyed engines consume; QA_GROUPS below is the display
// clustering (never a second taxonomy — same strings, grouped).
export const QA_GROUPS: { label: string; units: string[] }[] = [
  { label: 'Arithmetic', units: ['Percentages', 'Profit & Loss', 'Ratio & Proportion', 'Average', 'Mixtures', 'Time & Work', 'Pipes & Cisterns', 'Time Speed Distance', 'SI & CI'] },
  { label: 'Algebra', units: ['Linear Equations', 'Quadratic Equations', 'Functions', 'Inequalities', 'Logarithms', 'Progressions'] },
  { label: 'Geometry', units: ['Lines & Angles', 'Triangles', 'Quadrilaterals', 'Circles', 'Mensuration', 'Coordinate Geometry'] },
  { label: 'Modern Math', units: ['Permutation & Combination', 'Probability', 'Set Theory'] },
  { label: 'Number System', units: ['Divisibility', 'HCF & LCM', 'Remainders', 'Base System'] },
];
export const QUANT_TOPICS = QA_GROUPS.flatMap((g) => g.units);

// Habit tracks — declared in the Blueprint like everything else, but not
// exam topics: no weightage/prerequisite metadata, engines skip them.
// 'Daily Editorials' (habit) is deliberately named differently from VARC's
// 'Editorial Reading' (skill unit) — unit names are globally unique because
// several maps key on the unit string alone.
// There is deliberately NO "Revision" section: revision isn't a topic, it's
// a per-topic STATE — the 'revising' status on any unit ("Revision
// started") replaced the old QA/VARC/DILR/Formula-Revision pseudo-units.
export const MOCK_PREP_UNITS = ['Sectional Tests', 'Full Length Mocks', 'Mock Analysis', 'Error Log'];
export const READING_HABIT_UNITS = ['Daily Editorials', 'Business & Economy Reading', 'Long-form Reading'];

// The complete graph, in canonical display order — what the Blueprint
// Builder's preparation-mapping screens and the Analysis matrix render.
export type CoverageSectionId = 'VARC' | 'DILR' | 'QA' | 'MOCKS' | 'READING';
export interface KnowledgeSection {
  id: CoverageSectionId;
  label: string;
  groups: { label: string | null; units: string[] }[];
}
export const KNOWLEDGE_GRAPH: KnowledgeSection[] = [
  { id: 'VARC', label: 'VARC', groups: [{ label: null, units: VERBAL_TOPICS }] },
  { id: 'DILR', label: 'DILR', groups: [{ label: null, units: LRDI_TOPICS }] },
  { id: 'QA', label: 'QA', groups: QA_GROUPS },
  { id: 'MOCKS', label: 'Mock Preparation', groups: [{ label: null, units: MOCK_PREP_UNITS }] },
  { id: 'READING', label: 'Reading Habit', groups: [{ label: null, units: READING_HABIT_UNITS }] },
];

// Canonical position of every unit — coverage rows sort by this, so the
// grid always renders in graph order regardless of DB row order.
export const UNIT_ORDER: Record<string, number> = Object.fromEntries(
  KNOWLEDGE_GRAPH.flatMap((s) => s.groups).flatMap((g) => g.units).map((u, i) => [u, i])
);

// CAT topic metadata — the content facts every planning rule should read
// from, rather than hardcoding topic names or ordering directly. This is
// static reference data (same shape as the topic lists above), not a
// database or a graph: it doesn't change per-request, so it lives in code
// and is reviewed like any other content change, not queried at runtime.
//
// Values are a defensible first-pass ranking based on widely-known CAT prep
// conventions (RC dominates VARC scoring, Arithmetic is the broadest/most
// heavily tested QA area, DI and LR are roughly equal-weight in DILR) — they
// are editable content a subject-matter reviewer should refine, NOT measured
// data or the output of any study. Treat any specific number here as a
// starting estimate, never as a cited fact.
//
//   difficulty            1 (accessible) – 5 (hardest)
//   estimatedHours        rough hours to reach working competency from zero
//   weightage             relative emphasis within its OWN section, 1–5
//   revisionFrequencyDays  how many days before this topic typically needs
//                         revisiting — feeds the Mission Engine's revision
//                         signal instead of one flat constant for every topic
//   sequenceRank          order within its section (1 = earliest)
//   prerequisites          topic keys (within the same section) that should
//                         be at least "started" before this one is a good
//                         pick — a real edge list, not a rank-order proxy.
//                         Empty array = no prerequisite, safe to lead with.
export interface TopicMetadata {
  section: 'VARC' | 'DILR' | 'QA';
  difficulty: 1 | 2 | 3 | 4 | 5;
  estimatedHours: number;
  weightage: 1 | 2 | 3 | 4 | 5;
  revisionFrequencyDays: number;
  sequenceRank: number;
  prerequisites: string[];
}

export const TOPIC_METADATA: Record<string, TopicMetadata> = {
  // ── VARC — RC carries most of the section's marks and decays fastest
  // without regular reading; Editorial Reading is the feeder habit-skill
  // that keeps it alive. Para Summary and speed work genuinely build on RC.
  'Reading Comprehension':     { section: 'VARC', difficulty: 3, estimatedHours: 30, weightage: 5, revisionFrequencyDays: 4,  sequenceRank: 1, prerequisites: [] },
  'Para Jumbles':              { section: 'VARC', difficulty: 3, estimatedHours: 12, weightage: 3, revisionFrequencyDays: 6,  sequenceRank: 2, prerequisites: [] },
  'Para Summary':              { section: 'VARC', difficulty: 3, estimatedHours: 12, weightage: 3, revisionFrequencyDays: 6,  sequenceRank: 3, prerequisites: ['Reading Comprehension'] },
  'Odd One Out':               { section: 'VARC', difficulty: 3, estimatedHours: 8,  weightage: 2, revisionFrequencyDays: 7,  sequenceRank: 4, prerequisites: [] },
  'Sentence Completion':       { section: 'VARC', difficulty: 2, estimatedHours: 8,  weightage: 2, revisionFrequencyDays: 7,  sequenceRank: 5, prerequisites: [] },
  'Vocabulary':                { section: 'VARC', difficulty: 2, estimatedHours: 8,  weightage: 1, revisionFrequencyDays: 10, sequenceRank: 6, prerequisites: [] },
  'Grammar':                   { section: 'VARC', difficulty: 2, estimatedHours: 10, weightage: 1, revisionFrequencyDays: 8,  sequenceRank: 7, prerequisites: [] },
  'Editorial Reading':         { section: 'VARC', difficulty: 1, estimatedHours: 10, weightage: 4, revisionFrequencyDays: 3,  sequenceRank: 8, prerequisites: [] },
  'Reading Speed Practice':    { section: 'VARC', difficulty: 2, estimatedHours: 8,  weightage: 3, revisionFrequencyDays: 4,  sequenceRank: 9, prerequisites: ['Reading Comprehension'] },

  // ── DILR — Tables/Charts/Arrangements are the equal-weight core with no
  // prerequisite; caselets, games, and hybrid sets build on that base.
  'Tables':                    { section: 'DILR', difficulty: 2, estimatedHours: 10, weightage: 4, revisionFrequencyDays: 5, sequenceRank: 1, prerequisites: [] },
  'Charts':                    { section: 'DILR', difficulty: 2, estimatedHours: 10, weightage: 4, revisionFrequencyDays: 5, sequenceRank: 2, prerequisites: [] },
  'Caselets':                  { section: 'DILR', difficulty: 3, estimatedHours: 10, weightage: 3, revisionFrequencyDays: 6, sequenceRank: 3, prerequisites: ['Tables'] },
  'Arrangements':              { section: 'DILR', difficulty: 3, estimatedHours: 12, weightage: 5, revisionFrequencyDays: 5, sequenceRank: 4, prerequisites: [] },
  'Games & Tournaments':       { section: 'DILR', difficulty: 4, estimatedHours: 12, weightage: 3, revisionFrequencyDays: 6, sequenceRank: 5, prerequisites: ['Arrangements'] },
  'Selection & Distribution':  { section: 'DILR', difficulty: 3, estimatedHours: 10, weightage: 4, revisionFrequencyDays: 6, sequenceRank: 6, prerequisites: ['Arrangements'] },
  'Binary Logic':              { section: 'DILR', difficulty: 4, estimatedHours: 8,  weightage: 2, revisionFrequencyDays: 7, sequenceRank: 7, prerequisites: [] },
  'Venn / Sets':               { section: 'DILR', difficulty: 3, estimatedHours: 8,  weightage: 3, revisionFrequencyDays: 7, sequenceRank: 8, prerequisites: [] },
  'Hybrid DILR Sets':          { section: 'DILR', difficulty: 5, estimatedHours: 12, weightage: 4, revisionFrequencyDays: 5, sequenceRank: 9, prerequisites: ['Tables', 'Arrangements'] },

  // ── QA / Arithmetic — Percentages and Ratio are the two roots nearly
  // everything else in the cluster hangs off.
  'Percentages':               { section: 'QA', difficulty: 2, estimatedHours: 8,  weightage: 5, revisionFrequencyDays: 5, sequenceRank: 1,  prerequisites: [] },
  'Profit & Loss':             { section: 'QA', difficulty: 2, estimatedHours: 8,  weightage: 4, revisionFrequencyDays: 6, sequenceRank: 2,  prerequisites: ['Percentages'] },
  'Ratio & Proportion':        { section: 'QA', difficulty: 2, estimatedHours: 8,  weightage: 4, revisionFrequencyDays: 6, sequenceRank: 3,  prerequisites: [] },
  'Average':                   { section: 'QA', difficulty: 2, estimatedHours: 6,  weightage: 3, revisionFrequencyDays: 7, sequenceRank: 4,  prerequisites: [] },
  'Mixtures':                  { section: 'QA', difficulty: 3, estimatedHours: 6,  weightage: 2, revisionFrequencyDays: 7, sequenceRank: 5,  prerequisites: ['Ratio & Proportion'] },
  'Time & Work':               { section: 'QA', difficulty: 3, estimatedHours: 8,  weightage: 4, revisionFrequencyDays: 6, sequenceRank: 6,  prerequisites: ['Ratio & Proportion'] },
  'Pipes & Cisterns':          { section: 'QA', difficulty: 3, estimatedHours: 4,  weightage: 2, revisionFrequencyDays: 7, sequenceRank: 7,  prerequisites: ['Time & Work'] },
  'Time Speed Distance':       { section: 'QA', difficulty: 3, estimatedHours: 10, weightage: 4, revisionFrequencyDays: 5, sequenceRank: 8,  prerequisites: ['Ratio & Proportion'] },
  'SI & CI':                   { section: 'QA', difficulty: 2, estimatedHours: 6,  weightage: 3, revisionFrequencyDays: 7, sequenceRank: 9,  prerequisites: ['Percentages'] },

  // ── QA / Algebra
  'Linear Equations':          { section: 'QA', difficulty: 2, estimatedHours: 8,  weightage: 4, revisionFrequencyDays: 6, sequenceRank: 10, prerequisites: [] },
  'Quadratic Equations':       { section: 'QA', difficulty: 3, estimatedHours: 8,  weightage: 4, revisionFrequencyDays: 6, sequenceRank: 11, prerequisites: ['Linear Equations'] },
  'Functions':                 { section: 'QA', difficulty: 4, estimatedHours: 8,  weightage: 3, revisionFrequencyDays: 6, sequenceRank: 12, prerequisites: ['Quadratic Equations'] },
  'Inequalities':              { section: 'QA', difficulty: 3, estimatedHours: 6,  weightage: 3, revisionFrequencyDays: 6, sequenceRank: 13, prerequisites: ['Linear Equations'] },
  'Logarithms':                { section: 'QA', difficulty: 3, estimatedHours: 6,  weightage: 2, revisionFrequencyDays: 7, sequenceRank: 14, prerequisites: [] },
  'Progressions':              { section: 'QA', difficulty: 3, estimatedHours: 8,  weightage: 3, revisionFrequencyDays: 6, sequenceRank: 15, prerequisites: [] },

  // ── QA / Geometry
  'Lines & Angles':            { section: 'QA', difficulty: 2, estimatedHours: 6,  weightage: 2, revisionFrequencyDays: 7, sequenceRank: 16, prerequisites: [] },
  'Triangles':                 { section: 'QA', difficulty: 3, estimatedHours: 8,  weightage: 4, revisionFrequencyDays: 6, sequenceRank: 17, prerequisites: ['Lines & Angles'] },
  'Quadrilaterals':            { section: 'QA', difficulty: 3, estimatedHours: 6,  weightage: 2, revisionFrequencyDays: 7, sequenceRank: 18, prerequisites: ['Triangles'] },
  'Circles':                   { section: 'QA', difficulty: 3, estimatedHours: 8,  weightage: 3, revisionFrequencyDays: 6, sequenceRank: 19, prerequisites: ['Triangles'] },
  'Mensuration':               { section: 'QA', difficulty: 3, estimatedHours: 8,  weightage: 3, revisionFrequencyDays: 6, sequenceRank: 20, prerequisites: ['Triangles'] },
  'Coordinate Geometry':       { section: 'QA', difficulty: 3, estimatedHours: 8,  weightage: 2, revisionFrequencyDays: 7, sequenceRank: 21, prerequisites: ['Lines & Angles'] },

  // ── QA / Modern Math
  'Permutation & Combination': { section: 'QA', difficulty: 4, estimatedHours: 10, weightage: 3, revisionFrequencyDays: 6, sequenceRank: 22, prerequisites: [] },
  'Probability':               { section: 'QA', difficulty: 4, estimatedHours: 8,  weightage: 3, revisionFrequencyDays: 6, sequenceRank: 23, prerequisites: ['Permutation & Combination'] },
  'Set Theory':                { section: 'QA', difficulty: 2, estimatedHours: 5,  weightage: 2, revisionFrequencyDays: 8, sequenceRank: 24, prerequisites: [] },

  // ── QA / Number System
  'Divisibility':              { section: 'QA', difficulty: 3, estimatedHours: 6,  weightage: 3, revisionFrequencyDays: 6, sequenceRank: 25, prerequisites: [] },
  'HCF & LCM':                 { section: 'QA', difficulty: 2, estimatedHours: 5,  weightage: 3, revisionFrequencyDays: 7, sequenceRank: 26, prerequisites: ['Divisibility'] },
  'Remainders':                { section: 'QA', difficulty: 4, estimatedHours: 8,  weightage: 3, revisionFrequencyDays: 6, sequenceRank: 27, prerequisites: ['Divisibility'] },
  'Base System':               { section: 'QA', difficulty: 4, estimatedHours: 5,  weightage: 2, revisionFrequencyDays: 8, sequenceRank: 28, prerequisites: [] },
};

// Highest-weightage topic in a section, ties broken by earliest sequence —
// this is what DEFAULT_TOPIC_BY_SECTION and the Coverage Matrix's ordering
// actually read from, so "highest-weightage" is a real claim now, not just
// whichever topic happened to be listed first in the array above.
export function highestWeightageTopic(topics: string[]): string {
  return [...topics].sort((a, b) => {
    const wa = TOPIC_METADATA[a]?.weightage ?? 0;
    const wb = TOPIC_METADATA[b]?.weightage ?? 0;
    if (wb !== wa) return wb - wa;
    return (TOPIC_METADATA[a]?.sequenceRank ?? 99) - (TOPIC_METADATA[b]?.sequenceRank ?? 99);
  })[0];
}

// Single source of truth for "which topic if none was self-reported" —
// used both when a student skips the weak-topic tap (quick-setup route) and
// for the two non-weakest sections in the daily routine, which never get an
// onboarding tap of their own (routine-engine.ts). Each is that section's
// highest-weightage topic — a real, defensible default, never a blank one.
export const DEFAULT_TOPIC_BY_SECTION: Record<'VARC' | 'DILR' | 'QA', string> = {
  VARC: highestWeightageTopic(VERBAL_TOPICS),
  DILR: highestWeightageTopic(LRDI_TOPICS),
  QA: highestWeightageTopic(QUANT_TOPICS),
};

// Mock tests and practice
export const PRACTICE_TOPICS = [
  'Full-Length Mock',
  'Sectional Test',
  'Speed Practice',
  'Accuracy Practice',
  'Time Management',
];

// Learning & revision modes
export const OTHER_TOPICS = [
  'Conceptual Learning',
  'Doubt Solving',
  'Strategy Discussion',
  'Revision',
  'Error Analysis',
];

// Main category topics (for quick selection)
export const MAIN_CATEGORIES = [
  'Quant',
  'Verbal',
  'Logic Games',
  'Reading Comprehension',
  'Mock Test',
  'Revision',
];

// All topics combined (flat list for checkboxes)
export const ALL_TOPICS = [
  // Quant
  'Arithmetic',
  'Algebra',
  'Geometry',
  'Modern Math',
  'Number Systems',
  // Verbal
  'Reading Comprehension',
  'Sentence Correction',
  'Para Jumbles',
  'Para Summary',
  'Vocabulary',
  // LRDI
  'Logical Reasoning',
  'Data Interpretation',
  'Case Study',
  'Puzzles & Games',
  // Practice
  'Full-Length Mock',
  'Sectional Test',
  'Speed Practice',
  'Accuracy Practice',
  'Time Management',
  // Other
  'Conceptual Learning',
  'Doubt Solving',
  'Strategy Discussion',
  'Revision',
  'Error Analysis',
];

// Topic categories for display
export const TOPIC_CATEGORIES = {
  'Quantitative Aptitude': QUANT_TOPICS,
  'Verbal & Reading': VERBAL_TOPICS,
  'Logical Reasoning & DI': LRDI_TOPICS,
  'Practice & Tests': PRACTICE_TOPICS,
  'Learning Modes': OTHER_TOPICS,
};

// Get category name for a topic
export function getCategoryForTopic(topic: string): string | null {
  for (const [category, topics] of Object.entries(TOPIC_CATEGORIES)) {
    if (topics.includes(topic)) {
      return category;
    }
  }
  return null;
}

// Get emoji for topic
export const TOPIC_EMOJIS: Record<string, string> = {
  // Quant
  'Arithmetic': '➕',
  'Algebra': '𝑥',
  'Geometry': '📐',
  'Modern Math': '🔢',
  'Number Systems': '#️⃣',
  // Verbal
  'Reading Comprehension': '📖',
  'Sentence Correction': '✏️',
  'Para Jumbles': '🔤',
  'Para Summary': '📝',
  'Vocabulary': '📚',
  // LRDI
  'Logical Reasoning': '🧠',
  'Data Interpretation': '📊',
  'Case Study': '📋',
  'Puzzles & Games': '🧩',
  // Practice
  'Full-Length Mock': '🎯',
  'Sectional Test': '📑',
  'Speed Practice': '⚡',
  'Accuracy Practice': '🎯',
  'Time Management': '⏱️',
  // Other
  'Conceptual Learning': '💡',
  'Doubt Solving': '❓',
  'Strategy Discussion': '🗣️',
  'Revision': '🔄',
  'Error Analysis': '🔍',
};
