// ── Hours credited from what the student COVERED, not from a number they type ─
//
// Founder, 9 Aug (the Abhishek incident): "Remove the daily hours studied
// option. We already gave them a study plan — what's the use of hours they study
// daily? If they covered the topic, our goal is covered. If students fill the
// topic done, then count the hours — don't depend on them filling hours."
//
// So study_duration is no longer a self-reported field that a student could
// leave at 0 and silently lose their finish date over. It is DERIVED from
// coverage: the plan already knows the day is worth `generatedHours`; completing
// the plan's topics earns those hours, proportionally, and off-plan topics count
// as coverage too. One student marking their day done should never again read as
// "0 hours studied".

export interface CoverageInput {
  /** Hours the day's plan was built to (daily_routines.generated_hours). */
  generatedHours: number;
  /** How many topics today's plan had. */
  plannedTasks: number;
  /** Plan topics marked fully done. */
  fullDone: number;
  /** Plan topics marked half done. */
  halfDone: number;
  /** Off-plan sections the student also studied — coverage still counts. */
  offPlanCount: number;
}

/**
 * Hours to credit for the day. Deterministic, capped at the plan's own hours so
 * coverage can never inflate the day beyond what it was planned to be.
 *
 * fraction = (full + ½·half + off-plan) / planned topics, clamped to [0,1].
 * credited = generatedHours × fraction, rounded to one decimal.
 *
 * A day with no plan (plannedTasks = 0) credits 0 — there is no syllabus work to
 * price, so the finish date, which tracks the syllabus, does not move on it.
 */
export function creditedHours(input: CoverageInput): number {
  const planned = Math.max(0, Math.floor(input.plannedTasks));
  const gen = Math.max(0, input.generatedHours);
  if (planned <= 0 || gen <= 0) return 0;

  const covered = Math.max(0, input.fullDone) + 0.5 * Math.max(0, input.halfDone) + Math.max(0, input.offPlanCount);
  const fraction = Math.min(1, covered / planned);
  return Math.round(gen * fraction * 10) / 10;
}
