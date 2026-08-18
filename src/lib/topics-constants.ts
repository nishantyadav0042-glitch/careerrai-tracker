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

// ── THE EXAM SYLLABUS BOUNDARY (founder ruling D1, 18 Aug) ─────────────────
//
// "Do NOT count MOCKS or READING/habit-support activities inside syllabus
//  coverage. The canonical exam syllabus is 46 units: QA 28 + VARC 9 + DILR 9.
//  46 is the denominator for syllabus coverage."
//
// The graph holds 53 units; only 46 of them are syllabus. Taking a mock is
// preparation ACTIVITY — it can never make "syllabus covered" go up. Reading
// the same. Letting them into the denominator produces claims like "you are
// 72% through the CAT syllabus" where part of the 72% is mocks, which is not
// confusing UX, it is false measurement.
//
// Declared here, in the taxonomy that owns the units, and DERIVED from the
// graph rather than re-listed — the same law coverage-status.ts applies to the
// ladder. A unit added to VARC/DILR/QA becomes syllabus automatically; a unit
// added to MOCKS/READING never does.
//
// This exists because its absence was a live defect: prep-memory-data.ts
// counted a numerator over all 53 rows against a denominator of 46, and on
// 18 Aug four students carried a "Knowledge" percentage above 100 (max 111).
// signal-engine.ts had documented the intent correctly the whole time — "% of
// the 46 exam topics past not_started" — with nothing to enforce it.

/** The three sections that are actually examined. */
export const EXAM_SECTION_IDS: CoverageSectionId[] = ['VARC', 'DILR', 'QA'];

/** The 46 examined units. Everything else in the graph is preparation activity. */
export const EXAM_SYLLABUS_TOPICS: string[] = KNOWLEDGE_GRAPH
  .filter((s) => (EXAM_SECTION_IDS as string[]).includes(s.id))
  .flatMap((s) => s.groups.flatMap((g) => g.units));

const EXAM_SYLLABUS_SET = new Set(EXAM_SYLLABUS_TOPICS);

/**
 * Is this unit part of the examined syllabus?
 *
 * Fails closed: an unrecognised name is NOT syllabus. Admitting unknowns by
 * default is exactly how a 47th unit would slip into a 46-denominator ratio.
 */
export function isExamSyllabusTopic(topic: unknown): boolean {
  return typeof topic === 'string' && EXAM_SYLLABUS_SET.has(topic);
}

// Canonical position of every unit — coverage rows sort by this, so the
// grid always renders in graph order regardless of DB row order.
export const UNIT_ORDER: Record<string, number> = Object.fromEntries(
  KNOWLEDGE_GRAPH.flatMap((s) => s.groups).flatMap((g) => g.units).map((u, i) => [u, i])
);

// ── Onboarding core subset (founder, 22 Jul) ──────────────────────────────
// The onboarding coverage matrix must be SHORT: only the CORE topics, three
// exam sections (VARC, DILR, QA — QA last), each as ONE step (not QA's five
// cluster sub-steps), plus a short prep-habits tail. ~45 units the student
// actually taps, instead of the full 53. This is ONLY what onboarding SHOWS;
// the full KNOWLEDGE_GRAPH above is unchanged and still drives every other
// engine, and the coverage save still writes the whole graph (un-asked topics
// default to not_started) so the Analysis map, planner and pace stay complete.
//
// QA is trimmed from 28 to its highest-value 22: the six lowest-weightage /
// most peripheral topics — Mixtures, Pipes & Cisterns, Logarithms, HCF & LCM,
// Set Theory, Base System — are dropped from ONBOARDING only (never the graph;
// they're still in the Analysis matrix and can be marked there any time).
export const ONBOARDING_QA_CORE = [
  'Percentages', 'Profit & Loss', 'Ratio & Proportion', 'Average', 'Time & Work', 'Time Speed Distance', 'SI & CI',
  'Linear Equations', 'Quadratic Equations', 'Functions', 'Inequalities', 'Progressions',
  'Lines & Angles', 'Triangles', 'Quadrilaterals', 'Circles', 'Mensuration', 'Coordinate Geometry',
  'Permutation & Combination', 'Probability',
  'Divisibility', 'Remainders',
]; // 22 — one QA step, the last (3rd) core section
export const ONBOARDING_MOCK_CORE = ['Sectional Tests', 'Full Length Mocks', 'Mock Analysis']; // 3
export const ONBOARDING_READING_CORE = ['Daily Editorials', 'Business & Economy Reading'];     // 2

// VARC 9 + DILR 9 + QA 22 = 40 core exam topics, + 5 prep-habit "things" = 45.
// Order = VARC, DILR, QA (QA last core section), then the habit tail.
export const ONBOARDING_CORE_GRAPH: KnowledgeSection[] = [
  { id: 'VARC', label: 'VARC', groups: [{ label: null, units: VERBAL_TOPICS }] },
  { id: 'DILR', label: 'DILR', groups: [{ label: null, units: LRDI_TOPICS }] },
  { id: 'QA', label: 'QA', groups: [{ label: null, units: ONBOARDING_QA_CORE }] },
  { id: 'MOCKS', label: 'Mock Preparation', groups: [{ label: null, units: ONBOARDING_MOCK_CORE }] },
  { id: 'READING', label: 'Reading Habit', groups: [{ label: null, units: ONBOARDING_READING_CORE }] },
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
  'Ratio & Proportion':        { section: 'QA', difficulty: 2, estimatedHours: 8,  weightage: 5, revisionFrequencyDays: 6, sequenceRank: 3,  prerequisites: [] },
  'Average':                   { section: 'QA', difficulty: 2, estimatedHours: 6,  weightage: 4, revisionFrequencyDays: 7, sequenceRank: 4,  prerequisites: [] },
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

  // ── QA / Modern Math — the SMALLEST QA area (P&C + Probability + Set Theory
  // together are only ~2-3 questions/year). Weightage lowered to match real CAT
  // frequency so these never outrank Arithmetic/Algebra (16 Jul recalibration).
  'Permutation & Combination': { section: 'QA', difficulty: 4, estimatedHours: 10, weightage: 2, revisionFrequencyDays: 6, sequenceRank: 22, prerequisites: [] },
  'Probability':               { section: 'QA', difficulty: 4, estimatedHours: 8,  weightage: 2, revisionFrequencyDays: 6, sequenceRank: 23, prerequisites: ['Permutation & Combination'] },
  'Set Theory':                { section: 'QA', difficulty: 2, estimatedHours: 5,  weightage: 1, revisionFrequencyDays: 8, sequenceRank: 24, prerequisites: [] },

  // ── QA / Number System — small area (~1-2 questions/year). Remainders is the
  // one relatively frequent topic; the rest are low. Recalibrated 16 Jul.
  'Divisibility':              { section: 'QA', difficulty: 3, estimatedHours: 6,  weightage: 2, revisionFrequencyDays: 6, sequenceRank: 25, prerequisites: [] },
  'HCF & LCM':                 { section: 'QA', difficulty: 2, estimatedHours: 5,  weightage: 2, revisionFrequencyDays: 7, sequenceRank: 26, prerequisites: ['Divisibility'] },
  'Remainders':                { section: 'QA', difficulty: 4, estimatedHours: 8,  weightage: 3, revisionFrequencyDays: 6, sequenceRank: 27, prerequisites: ['Divisibility'] },
  'Base System':               { section: 'QA', difficulty: 4, estimatedHours: 5,  weightage: 1, revisionFrequencyDays: 8, sequenceRank: 28, prerequisites: [] },
};

// QA sub-cluster + its approximate share of the Quant section, derived from the
// sequenceRank ranges above. Powers the expert "why this topic" line on the plan
// card ("Algebra — ~a third of Quant"). Shares from published CAT analyses
// (Arithmetic ~38%, Algebra ~33%, Geometry ~14%, Number System / Modern Math the
// rest).
export function qaCluster(topic: string): { name: string; share: string } | null {
  const m = TOPIC_METADATA[topic];
  if (!m || m.section !== 'QA') return null;
  const r = m.sequenceRank;
  if (r <= 9)  return { name: 'Arithmetic',    share: 'the biggest area in Quant (~40%)' };
  if (r <= 15) return { name: 'Algebra',       share: '~a third of Quant' };
  if (r <= 21) return { name: 'Geometry',      share: '~15% of Quant' };
  if (r <= 24) return { name: 'Modern Math',   share: 'a small slice of Quant' };
  return              { name: 'Number System', share: 'a small slice of Quant' };
}

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

// PRACTICE_TOPICS, OTHER_TOPICS, MAIN_CATEGORIES, ALL_TOPICS,
// TOPIC_CATEGORIES, getCategoryForTopic, TOPIC_EMOJIS — removed. This was
// a pre-Knowledge-Graph flat taxonomy (5 QA / 5 VARC / 4 DILR topics) with
// its own separate category/emoji maps; its only consumer was the dead
// quick-log-sheet.tsx under student/home/, deleted alongside this. The
// live taxonomy is KNOWLEDGE_GRAPH above.
