/**
 * Comprehensive topics list for student daily activity tracking
 * Organized by CAT exam sections and learning modes
 * Used across daily logs, quick logs, and onboarding
 */

// Quantitative Aptitude subsections
export const QUANT_TOPICS = [
  'Arithmetic',
  'Algebra',
  'Geometry',
  'Modern Math',
  'Number Systems',
];

// Verbal & Reading Comprehension subsections
export const VERBAL_TOPICS = [
  'Reading Comprehension',
  'Sentence Correction',
  'Para Jumbles',
  'Para Summary',
  'Vocabulary',
];

// Logical Reasoning & Data Interpretation
export const LRDI_TOPICS = [
  'Logical Reasoning',
  'Data Interpretation',
  'Case Study',
  'Puzzles & Games',
];

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
  // QA — Arithmetic and Number Systems first (foundational, highest
  // weightage, no prerequisite); Algebra/Geometry/Modern Math lean on that
  // fluency, so they carry a real prerequisite edge, not just a rank number.
  'Arithmetic':            { section: 'QA', difficulty: 2, estimatedHours: 25, weightage: 5, revisionFrequencyDays: 5, sequenceRank: 1, prerequisites: [] },
  'Number Systems':        { section: 'QA', difficulty: 3, estimatedHours: 20, weightage: 4, revisionFrequencyDays: 6, sequenceRank: 2, prerequisites: [] },
  'Algebra':               { section: 'QA', difficulty: 3, estimatedHours: 22, weightage: 4, revisionFrequencyDays: 6, sequenceRank: 3, prerequisites: ['Arithmetic'] },
  'Geometry':              { section: 'QA', difficulty: 4, estimatedHours: 20, weightage: 3, revisionFrequencyDays: 7, sequenceRank: 4, prerequisites: ['Arithmetic'] },
  'Modern Math':           { section: 'QA', difficulty: 4, estimatedHours: 15, weightage: 2, revisionFrequencyDays: 8, sequenceRank: 5, prerequisites: ['Algebra'] },

  // VARC — RC carries most of the section's marks and decays fastest
  // without regular reading, so it leads on both weightage and cadence.
  // Para Summary genuinely builds on RC comprehension skill; the rest are
  // independent skills with no real prerequisite.
  'Reading Comprehension': { section: 'VARC', difficulty: 3, estimatedHours: 30, weightage: 5, revisionFrequencyDays: 4, sequenceRank: 1, prerequisites: [] },
  'Para Summary':          { section: 'VARC', difficulty: 3, estimatedHours: 12, weightage: 3, revisionFrequencyDays: 6, sequenceRank: 2, prerequisites: ['Reading Comprehension'] },
  'Para Jumbles':          { section: 'VARC', difficulty: 3, estimatedHours: 12, weightage: 3, revisionFrequencyDays: 6, sequenceRank: 3, prerequisites: [] },
  'Sentence Correction':   { section: 'VARC', difficulty: 2, estimatedHours: 10, weightage: 2, revisionFrequencyDays: 7, sequenceRank: 4, prerequisites: [] },
  'Vocabulary':            { section: 'VARC', difficulty: 2, estimatedHours: 8,  weightage: 1, revisionFrequencyDays: 10, sequenceRank: 5, prerequisites: [] },

  // DILR — DI and LR are the roughly-equal-weight core with no prerequisite;
  // Puzzles & Case Study are denser variants that build on that base.
  'Data Interpretation':   { section: 'DILR', difficulty: 3, estimatedHours: 22, weightage: 4, revisionFrequencyDays: 5, sequenceRank: 1, prerequisites: [] },
  'Logical Reasoning':     { section: 'DILR', difficulty: 3, estimatedHours: 22, weightage: 4, revisionFrequencyDays: 5, sequenceRank: 2, prerequisites: [] },
  'Puzzles & Games':       { section: 'DILR', difficulty: 4, estimatedHours: 18, weightage: 3, revisionFrequencyDays: 6, sequenceRank: 3, prerequisites: ['Logical Reasoning'] },
  'Case Study':            { section: 'DILR', difficulty: 4, estimatedHours: 15, weightage: 3, revisionFrequencyDays: 7, sequenceRank: 4, prerequisites: ['Data Interpretation'] },
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
