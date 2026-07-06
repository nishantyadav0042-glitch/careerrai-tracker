// Blueprint Builder — the section model + live-assembly preview behind the
// onboarding flow. Deliberately not called "onboarding" anywhere in this
// file: every field collected here is a real input to routine-engine,
// topic-selector, or prep-memory (see the field-by-field mapping in each
// section below) — this computes what's already true about the Blueprint
// being built, not a decorative progress indicator.
//
// Pure and parse-free like every other engine in this codebase — the caller
// passes in whatever's been answered so far, this derives what's now knowable.

export type SectionId = 'position' | 'preparation' | 'time' | 'coverage';

export interface BlueprintSection {
  id: SectionId;
  order: number;
  eyebrow: string; // the transition line shown once entering the section
}

export const BLUEPRINT_SECTIONS: BlueprintSection[] = [
  { id: 'position',    order: 0, eyebrow: "Let's understand where you are" },
  { id: 'preparation', order: 1, eyebrow: "Let's understand your preparation" },
  { id: 'time',        order: 2, eyebrow: "Let's understand your available time" },
  { id: 'coverage',    order: 3, eyebrow: "Let's understand what you've already covered" },
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
}

export interface BlueprintPreview {
  examBadge: string | null;
  archetypeBadge: string | null;
  focusBadge: string | null;
  weeklyLoadHours: number | null;
  filledFacts: number; // how many of the 3 data-derived fact slots are lit
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

export function computeBlueprintPreview(input: BlueprintPreviewInput): BlueprintPreview {
  const exam = examBadge(input);
  const archetype = archetypeBadge(input);
  const focus = focusBadge(input);
  const load = weeklyLoadHours(input);

  return {
    examBadge: exam,
    archetypeBadge: archetype,
    focusBadge: focus,
    weeklyLoadHours: load,
    filledFacts: [exam, archetype, focus, load].filter((v) => v != null).length,
  };
}
