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
}

// No 'preparation' section — the single-topic self-report taps (weakest
// section/topic, stage, blocker, baseline) were superseded by the explicit
// per-topic Coverage declaration, and the engines derive those signals from
// it (see /api/routine/today's coverage-derived weakest section).
export const BLUEPRINT_SECTIONS: BlueprintSection[] = [
  { id: 'position', order: 0, eyebrow: "Let's understand where you are" },
  { id: 'time',     order: 1, eyebrow: "Let's understand your available time" },
  { id: 'coverage', order: 2, eyebrow: "Let's understand what you've already covered" },
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
  coverage_done?: number | null;
  coverage_started?: number | null;
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
// coverage is declared (recomputed from what's actually left). The constants
// are deliberately coarse and the copy says "≈": this is a pace estimate,
// not a promise. ~12 focused hours to take an untouched CAT topic to "done
// once," half that to finish a started one — spread across the ~14-topic
// taxonomy this lands in the 150-180h total prep range commonly cited for
// CAT, and it's stated here once so there's a single place to tune it.
const HOURS_PER_UNTOUCHED_TOPIC = 12;
const HOURS_PER_STARTED_TOPIC = 6;
const TOTAL_TOPICS = 14;

export interface CoverageProjection {
  weeks: number;           // ≈ weeks to finish remaining coverage at this load
  basedOnDeclared: boolean; // false = pre-coverage assumption (nothing done yet)
}

export function projectCoverageWeeks(input: BlueprintPreviewInput): CoverageProjection | null {
  const load = weeklyLoadHours(input);
  if (load == null || load <= 0) return null;
  const total = input.coverage_total ?? TOTAL_TOPICS;
  const declared = input.coverage_total != null;
  const done = declared ? (input.coverage_done ?? 0) : 0;
  const started = declared ? (input.coverage_started ?? 0) : 0;
  const untouched = Math.max(0, total - done - started);
  const hoursLeft = untouched * HOURS_PER_UNTOUCHED_TOPIC + started * HOURS_PER_STARTED_TOPIC;
  return { weeks: Math.max(1, Math.ceil(hoursLeft / load)), basedOnDeclared: declared };
}

function projectionBadge(input: BlueprintPreviewInput): string | null {
  const p = projectCoverageWeeks(input);
  if (p == null) return null;
  if (p.basedOnDeclared) {
    const done = input.coverage_done ?? 0;
    if (done >= (input.coverage_total ?? TOTAL_TOPICS)) return 'Coverage complete — revision mode';
    return `Remaining topics ≈ ${p.weeks} week${p.weeks === 1 ? '' : 's'} at your pace`;
  }
  return `Full syllabus ≈ ${p.weeks} weeks at this pace`;
}

// coverageBadge unlocks once the student has explicitly declared the whole
// grid (Section 4) — the exact per-topic statuses they tapped, never an
// inferred count. Feeds topic-selector.ts's coverage-status scoring.
function coverageBadge(input: BlueprintPreviewInput): string | null {
  if (input.coverage_total == null) return null;
  const done = input.coverage_done ?? 0;
  const started = input.coverage_started ?? 0;
  if (done === 0 && started === 0) return `Coverage: starting fresh (0/${input.coverage_total})`;
  const parts = [`${done} done`];
  if (started > 0) parts.push(`${started} in progress`);
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
