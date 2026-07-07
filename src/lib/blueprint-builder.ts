// Blueprint Builder — the section model + live-assembly preview behind the
// onboarding flow. Deliberately not called "onboarding" anywhere in this
// file: every field collected here is a real input to routine-engine,
// topic-selector, or prep-memory (see the field-by-field mapping in each
// section below) — this computes what's already true about the Blueprint
// being built, not a decorative progress indicator.
//
// Pure and parse-free like every other engine in this codebase — the caller
// passes in whatever's been answered so far, this derives what's now knowable.

export type SectionId = 'position' | 'time' | 'coverage';

export interface BlueprintSection {
  id: SectionId;
  order: number;
  eyebrow: string; // the transition line shown once entering the section
  // WHY this section exists, shown before it asks anything — every screen
  // answers "why am I doing this" before it asks the student to do it.
  // Purpose, not progress, not motivation.
  purpose: string;
}

// No 'preparation' section — the single-topic self-report taps (weakest
// section/topic, stage, blocker, baseline) were superseded by the explicit
// per-topic Coverage declaration, and the engines derive those signals from
// it (see /api/routine/today's coverage-derived weakest section).
export const BLUEPRINT_SECTIONS: BlueprintSection[] = [
  {
    id: 'position', order: 0, eyebrow: "Let's understand where you are",
    purpose: 'Your CAT Plan starts with your exam, your attempt, your life. Not a template.',
  },
  {
    id: 'time', order: 1, eyebrow: "Let's understand your available time",
    purpose: 'Plans that ignore real hours fail in week one. Yours never will.',
  },
  {
    id: 'coverage', order: 2, eyebrow: "Let's understand what you've already covered",
    purpose: "This is the most important part. Thousands of CAT students study every day — very few know what they should study NEXT. These 90 seconds solve that.",
  },
];

export interface BlueprintPreviewInput {
  attempt_year?: number | null;
  is_repeater?: boolean | null;
  is_working_professional?: boolean | null;
  course_year?: number | null;
  weakest_section?: string | null;
  weak_topic?: string | null;
  studyTargetHours?: number | null;
  weekendHours?: number | null;
  coverage_practicing?: number | null;
  coverage_learning?: number | null;
  coverage_total?: number | null;
}

export interface BlueprintPreview {
  examBadge: string | null;
  archetypeBadge: string | null;
  focusBadge: string | null;
  weeklyLoadHours: number | null;
  coverageBadge: string | null;
  projectionBadge: string | null;
  filledFacts: number; // how many of the data-derived fact slots are lit
}

// examBadge unlocks right after Exam Context (attempt_year + is_repeater
// both land in the same screen submit) — feeds routine-engine's phase calc
// (resolveCatExamDate) and study-plan's archetype.
function examBadge(input: BlueprintPreviewInput): string | null {
  if (input.attempt_year == null || input.is_repeater == null) return null;
  return `CAT ${input.attempt_year} · ${input.is_repeater ? 'Repeater' : 'First attempt'}`;
}

// archetypeBadge unlocks after About You — feeds archetypeRevisionMultiplier
// (topic-selector.ts) and the working-professional hour defaults in
// routine-engine.ts.
function archetypeBadge(input: BlueprintPreviewInput): string | null {
  if (input.is_working_professional == null) return null;
  if (input.is_working_professional) return 'Working Professional';
  if (input.course_year != null) return `Student · Year ${input.course_year}`;
  return 'Student';
}

// focusBadge unlocks after the weak-section/topic tap — feeds
// topic-selector.ts's self-report bonus and mission-engine.ts's
// weak-revision candidate.
function focusBadge(input: BlueprintPreviewInput): string | null {
  if (!input.weakest_section) return null;
  return input.weak_topic ? `${input.weakest_section} — ${input.weak_topic}` : input.weakest_section;
}

// weeklyLoadHours unlocks once BOTH weekday and weekend hours are known
// (Section 3) — feeds routine-engine.ts's weekdayHours/weekendHours split
// directly (5 weekdays + 2 weekend days).
function weeklyLoadHours(input: BlueprintPreviewInput): number | null {
  if (input.studyTargetHours == null || input.weekendHours == null) return null;
  return Math.round((input.studyTargetHours * 5 + input.weekendHours * 2) * 10) / 10;
}

// ─── Live projection (the Noom pattern, deterministic) ─────────────────────
// A rough completion forecast that visibly updates as answers land — first
// when weekly hours are known (assumes nothing covered yet), again after
// the preparation map is declared (recomputed from what's actually left).
// The constants are deliberately coarse and the copy says "≈": this is a
// pace estimate, not a promise. ~5 focused hours to take one granular
// Knowledge Graph unit from untouched to practicing, 3 to finish one still
// at learning, 1.5 to polish one already practicing — across the 46 exam
// units this lands in the 200-250h total-prep range, stated once here so
// there's a single place to tune it.
const HOURS_PER_UNTOUCHED_UNIT = 5;
const HOURS_PER_LEARNING_UNIT = 3;
const HOURS_PER_PRACTICING_UNIT = 1.5;
export const EXAM_UNIT_COUNT = 46; // VARC 9 + DILR 9 + QA 28

export interface CoverageProjection {
  weeks: number;           // ≈ weeks to finish remaining coverage at this load
  basedOnDeclared: boolean; // false = pre-coverage assumption (nothing done yet)
}

export function projectCoverageWeeks(input: BlueprintPreviewInput): CoverageProjection | null {
  const load = weeklyLoadHours(input);
  if (load == null || load <= 0) return null;
  const total = input.coverage_total ?? EXAM_UNIT_COUNT;
  const declared = input.coverage_total != null;
  const practicing = declared ? (input.coverage_practicing ?? 0) : 0;
  const learning = declared ? (input.coverage_learning ?? 0) : 0;
  const untouched = Math.max(0, total - practicing - learning);
  const hoursLeft = untouched * HOURS_PER_UNTOUCHED_UNIT + learning * HOURS_PER_LEARNING_UNIT + practicing * HOURS_PER_PRACTICING_UNIT;
  return { weeks: Math.max(1, Math.ceil(hoursLeft / load)), basedOnDeclared: declared };
}

function projectionBadge(input: BlueprintPreviewInput): string | null {
  const p = projectCoverageWeeks(input);
  if (p == null) return null;
  if (p.basedOnDeclared) return `Remaining syllabus ≈ ${p.weeks} week${p.weeks === 1 ? '' : 's'} at your pace`;
  return `Full syllabus ≈ ${p.weeks} weeks at this pace`;
}

// coverageBadge unlocks once the student has explicitly declared the whole
// grid — the exact per-unit statuses they tapped, never an inferred count.
// Feeds topic-selector.ts's coverage-status scoring.
function coverageBadge(input: BlueprintPreviewInput): string | null {
  if (input.coverage_total == null) return null;
  const practicing = input.coverage_practicing ?? 0;
  const learning = input.coverage_learning ?? 0;
  if (practicing === 0 && learning === 0) return `Starting fresh — all ${input.coverage_total} units ahead`;
  const parts: string[] = [];
  if (practicing > 0) parts.push(`${practicing} practicing`);
  if (learning > 0) parts.push(`${learning} learning`);
  return `Coverage: ${parts.join(' · ')} of ${input.coverage_total}`;
}

export function computeBlueprintPreview(input: BlueprintPreviewInput): BlueprintPreview {
  const exam = examBadge(input);
  const archetype = archetypeBadge(input);
  const focus = focusBadge(input);
  const load = weeklyLoadHours(input);
  const coverage = coverageBadge(input);
  const projection = projectionBadge(input);

  return {
    examBadge: exam,
    archetypeBadge: archetype,
    focusBadge: focus,
    weeklyLoadHours: load,
    coverageBadge: coverage,
    projectionBadge: projection,
    filledFacts: [exam, archetype, focus, load, coverage].filter((v) => v != null).length,
  };
}
