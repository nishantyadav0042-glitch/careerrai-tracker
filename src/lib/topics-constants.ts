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

// Single source of truth for "which topic if none was self-reported" —
// used both when a student skips the weak-topic tap (quick-setup route) and
// for the two non-weakest sections in the daily routine, which never get an
// onboarding tap of their own (routine-engine.ts). Each is that section's
// highest-weightage topic — a real, defensible default, never a blank one.
export const DEFAULT_TOPIC_BY_SECTION: Record<'VARC' | 'DILR' | 'QA', string> = {
  VARC: VERBAL_TOPICS[0],
  DILR: LRDI_TOPICS[0],
  QA: QUANT_TOPICS[0],
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
