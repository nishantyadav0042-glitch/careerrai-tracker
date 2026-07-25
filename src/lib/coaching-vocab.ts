import { VERBAL_TOPICS, LRDI_TOPICS, QUANT_TOPICS } from '@/lib/topics-constants';
import type { TargetKind } from '@/lib/timetable';

// Sourced from topics-constants, NOT from lib/timetable — timetable imports
// this module, and importing a runtime value back from it forms a cycle that
// blows up at module-init ("Cannot access 'o' before initialization"). The
// type import above is erased at compile time, so it's safe.
const ALL_TOPICS: string[] = [...VERBAL_TOPICS, ...LRDI_TOPICS, ...QUANT_TOPICS];

// Every coaching says the same thing in different words. T.I.M.E. calls a mock
// an AIMCAT, IMS calls it a SimCAT, Rodha calls it an FLM. "Sheet 4",
// "Exercise 6", "HW" and "Assignment" are all the same object.
//
// This is the translation layer, and it is deliberately DETERMINISTIC code
// rather than another instruction bolted onto the prompt. A model asked to
// normalise vocabulary will be right most of the time and quietly wrong the
// rest — and a wrong mapping here silently corrupts a student's progress
// tracking. A lookup table is testable, free, and identical every run.

const ACTIVITY_ALIASES: Record<string, TargetKind> = {
  // Mocks — the same object under five brand names.
  'mock': 'mock', 'mocks': 'mock', 'flm': 'mock', 'flms': 'mock',
  'full length mock': 'mock', 'full length test': 'mock', 'full length': 'mock',
  'aimcat': 'mock', 'aimcats': 'mock', 'simcat': 'mock', 'simcats': 'mock',
  'cat mock': 'mock', 'proctored mock': 'mock',

  'sectional': 'sectional', 'sectionals': 'sectional',
  'sectional test': 'sectional', 'sectional tests': 'sectional',

  'topic test': 'topic_test', 'topic tests': 'topic_test',
  'topicwise test': 'topic_test', 'topic wise test': 'topic_test',
  'daily dose': 'topic_test', 'daily quiz': 'topic_test', 'quiz': 'topic_test',

  // Practice material. Institutes name these constantly and mean one thing:
  // a batch of questions to solve.
  'worksheet': 'questions', 'worksheets': 'questions', 'sheet': 'questions',
  'sheets': 'questions', 'exercise': 'questions', 'exercises': 'questions',
  'hw': 'questions', 'homework': 'questions', 'assignment': 'questions',
  'assignments': 'questions', 'pyq': 'questions', 'pyqs': 'questions',
  'previous year questions': 'questions', 'practice questions': 'questions',
  'questions': 'questions', 'ques': 'questions', 'qs': 'questions',

  'set': 'sets', 'sets': 'sets', 'lrdi set': 'sets', 'lrdi sets': 'sets',
  'dilr set': 'sets', 'dilr sets': 'sets', 'caselet': 'sets', 'caselets': 'sets',

  'revision': 'revision', 'revise': 'revision', 'booster': 'revision',
  'boosters': 'revision', 'marathon': 'revision', 'mega marathon': 'revision',
  'recap': 'revision',

  'lecture': 'classes', 'lectures': 'classes', 'class': 'classes',
  'classes': 'classes', 'recording': 'classes', 'recordings': 'classes',
  'session': 'classes', 'sessions': 'classes', 'live class': 'classes',
};

// Abbreviations students and faculty actually write. Only LEAF topics map.
// Parent headings ("Arithmetic", "Algebra", "Geometry", "Number System") are
// deliberately absent: they cover several of our units, and picking one would
// be a guess dressed up as data. Unmapped keeps the raw label and stores null.
const TOPIC_ALIASES: Record<string, string> = {
  'tsd': 'Time Speed Distance', 'time speed and distance': 'Time Speed Distance',
  'speed time distance': 'Time Speed Distance', 'time speed & distance': 'Time Speed Distance',
  'p&c': 'Permutation & Combination', 'pnc': 'Permutation & Combination',
  'permutation and combination': 'Permutation & Combination',
  'permutations and combinations': 'Permutation & Combination',
  'si ci': 'SI & CI', 'si & ci': 'SI & CI', 'si and ci': 'SI & CI',
  'simple and compound interest': 'SI & CI', 'simple & compound interest': 'SI & CI',
  'interest': 'SI & CI',
  'rc': 'Reading Comprehension', 'reading comp': 'Reading Comprehension',
  'pj': 'Para Jumbles', 'para jumble': 'Para Jumbles', 'jumbled paragraph': 'Para Jumbles',
  'para summary': 'Para Summary', 'summary': 'Para Summary',
  'odd one out': 'Odd One Out', 'odd sentence out': 'Odd One Out',
  'sentence correction': 'Grammar', 'english usage': 'Grammar',
  'english usage/grammar': 'Grammar', 'grammar': 'Grammar',
  'vocab': 'Vocabulary',
  'p&l': 'Profit & Loss', 'profit loss': 'Profit & Loss',
  'profit and loss': 'Profit & Loss', 'profit, loss & discount': 'Profit & Loss',
  'profit loss and discount': 'Profit & Loss',
  'ratio proportion': 'Ratio & Proportion', 'ratio and proportion': 'Ratio & Proportion',
  'ratio': 'Ratio & Proportion',
  'averages': 'Average',
  'alligation': 'Mixtures', 'mixtures and alligation': 'Mixtures',
  'mixtures & allegation': 'Mixtures', 'mixture': 'Mixtures',
  'time and work': 'Time & Work', 'work and time': 'Time & Work', 'time work': 'Time & Work',
  'pipes and cisterns': 'Pipes & Cisterns',
  'percentage': 'Percentages', 'percent': 'Percentages', 'percents': 'Percentages',
  'linear equation': 'Linear Equations', 'linear equations': 'Linear Equations',
  'quadratic equation': 'Quadratic Equations', 'quadratics': 'Quadratic Equations',
  'log': 'Logarithms', 'logarithm': 'Logarithms',
  'ap gp': 'Progressions', 'sequence and series': 'Progressions',
  'progression': 'Progressions', 'series': 'Progressions',
  'inequality': 'Inequalities',
  'function': 'Functions',
  'coordinate': 'Coordinate Geometry', 'co ordinate geometry': 'Coordinate Geometry',
  'lines and angles': 'Lines & Angles',
  'triangle': 'Triangles', 'quadrilateral': 'Quadrilaterals', 'circle': 'Circles',
  'solids': 'Mensuration', 'surds & indices': 'Progressions',
  'venn diagram': 'Venn / Sets', 'venn diagrams': 'Venn / Sets',
  'venn': 'Venn / Sets', 'set theory': 'Venn / Sets', 'sets theory': 'Venn / Sets',
  'games and tournaments': 'Games & Tournaments', 'games & tournament': 'Games & Tournaments',
  'tournaments': 'Games & Tournaments', 'games': 'Games & Tournaments',
  'arrangement': 'Arrangements', 'seating arrangement': 'Arrangements',
  'selections & ordering': 'Selection & Distribution',
  'selection and distribution': 'Selection & Distribution',
  'networks & routes': 'Hybrid DILR Sets', 'networks and routes': 'Hybrid DILR Sets',
  'data sufficiency': 'Hybrid DILR Sets',
  'di based reasoning': 'Charts', 'graphs': 'Charts', 'bar graph': 'Charts',
  'table': 'Tables',
  'critical reasoning': 'Binary Logic', 'verbal reasoning': 'Binary Logic',
  'binary logic': 'Binary Logic',
  'hcf lcm': 'HCF & LCM', 'hcf and lcm': 'HCF & LCM', 'lcm hcf': 'HCF & LCM',
  'remainder': 'Remainders', 'divisibility': 'Divisibility',
  'base systems': 'Base System',
  'probability': 'Probability', 'mensuration': 'Mensuration',
};

/** Lower-case, drop punctuation, collapse whitespace. "P&C " -> "p&c". */
export function normalizeKey(raw: string): string {
  return raw
    .toLowerCase()
    // Hyphens, plus and slash matter: real sheets write "SI-CI + Instalments"
    // and "English Usage/Grammar", and leaving them in blocked the lookup.
    .replace(/[.:;,()[\]{}'"\-+/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const EXACT_TOPIC = new Map(ALL_TOPICS.map((t) => [normalizeKey(t), t]));

/**
 * A coaching's words -> one of OUR topics, or null.
 *
 * Order matters: an exact match on our own name wins, then a known alias, then
 * a contained alias for labels like "Arithmetic : Percentages". Never a fuzzy
 * guess — an unmapped topic keeps its raw label and stores null, which is
 * honest, where a wrong mapping silently corrupts the coverage matrix.
 */
export function resolveTopic(raw: string): string | null {
  const key = normalizeKey(raw);
  if (!key) return null;

  const exact = EXACT_TOPIC.get(key);
  if (exact) return exact;

  const alias = TOPIC_ALIASES[key];
  if (alias) return alias;

  // "Arithmetic : Percentages", "LRDI 3 - Venn Diagrams". Longest alias first
  // so "si & ci" can't be beaten by a shorter accidental substring.
  const candidates = [...Object.keys(TOPIC_ALIASES), ...EXACT_TOPIC.keys()]
    .sort((a, b) => b.length - a.length);
  for (const c of candidates) {
    if (c.length >= 4 && key.includes(c)) {
      return TOPIC_ALIASES[c] ?? EXACT_TOPIC.get(c) ?? null;
    }
  }
  return null;
}

/**
 * A coaching's words -> a normalized activity kind, or null when the line
 * names no recognisable deliverable (motivational text, announcements).
 */
export function resolveActivity(raw: string): TargetKind | null {
  const key = normalizeKey(raw);
  if (!key) return null;

  const exact = ACTIVITY_ALIASES[key];
  if (exact) return exact;

  const candidates = Object.keys(ACTIVITY_ALIASES).sort((a, b) => b.length - a.length);
  for (const c of candidates) {
    // Word-boundary match so "set" doesn't fire inside "sentence".
    if (new RegExp(`(^|\\s)${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(key)) {
      return ACTIVITY_ALIASES[c];
    }
  }
  return null;
}
