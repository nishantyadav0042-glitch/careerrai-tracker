// ── Is today's stored plan stale? ───────────────────────────────────────────
//
// Today's routine is generated ONCE and frozen in daily_routines. That freeze is
// correct almost always — a plan that reshuffles under the student while they
// are working from it is worse than a slightly stale one. This module owns the
// narrow exceptions, as pure functions, so the rule is testable and lives in ONE
// place instead of growing a second implementation inside the route (the failure
// class in ENGINEERING-MEMORY #4/#5/#9).
//
// Two exceptions exist:
//   1. THE STUDENT changed their own daily hours (6 Aug — see below)
//   2. the student reported yesterday AFTER today's plan was built (29 Jul)
//
// Exception 1 used to be "the pace target moved materially", where pace meant
// remaining syllabus ÷ days to the finish date. That was a number the student
// never chose and that drifts on its own every single day as the calendar
// advances — so on any day near the 0.5h threshold it could tear down a plan
// mid-morning and hand back different topics, with the student having done
// nothing. Now it watches the hours the plan is actually built from, which
// only ever move when the student themselves moves them. That makes the
// rebuild a response to a request, which is the only kind of rebuild that has
// ever been wanted here.
//
// Both are gated on the same hard precondition: NOTHING is ticked off today.
// Regenerating over completed work would erase what the student has already
// done, which is the bug the 14 July audit logged. That guard is not a
// nice-to-have — it is the reason this is safe at all.

export interface PlanFreshnessInput {
  /** Ticks recorded against today's plan. Any tick at all freezes the plan. */
  completionCount: number;
  /** daily_routines.created_at for today's row. null on legacy rows. */
  routineCreatedAt: string | null;
  /** Daily hours the stored routine was built to. null on legacy rows. */
  generatedHours: number | null;
  /** The hours today's plan would be built to right now. */
  currentHours: number | null;
  /** daily_reports.updated_at for YESTERDAY, when a report exists. */
  yesterdayReportUpdatedAt?: string | null;
}

export type StaleReason = 'hours_changed' | 'checked_in_after_build';

/**
 * Hours moved enough that the plan was sized for a different day.
 *
 * The slider steps in half hours, so any real change the student makes clears
 * this. It exists only to absorb float noise, not to tolerate drift.
 */
const HOURS_CHANGED_THRESHOLD = 0.25;

function ms(v: string | null | undefined): number {
  if (!v) return NaN;
  return Date.parse(v);
}

/**
 * Why today's plan should be rebuilt, or null to keep it exactly as stored.
 *
 * Defaults hard toward KEEPING the plan: an unknown timestamp, missing hours,
 * a legacy row or a single tick all mean "not stale". We only rebuild on
 * positive evidence that the stored plan predates what we now know.
 */
export function planStaleReason(input: PlanFreshnessInput): StaleReason | null {
  // Any completed work freezes today. Checked first because it outranks
  // every other consideration.
  if (input.completionCount > 0) return null;

  if (
    input.currentHours != null &&
    input.generatedHours != null &&
    Math.abs(input.generatedHours - input.currentHours) > HOURS_CHANGED_THRESHOLD
  ) {
    return 'hours_changed';
  }

  // The check-in arrived after the plan was built, so the plan cannot have
  // taken it into account. Strictly greater-than: a report written in the same
  // millisecond as the build was already available to it, and treating equal
  // timestamps as stale would rebuild the plan the engine just generated.
  const reportedAt = ms(input.yesterdayReportUpdatedAt);
  const builtAt = ms(input.routineCreatedAt);
  if (!Number.isNaN(reportedAt) && !Number.isNaN(builtAt) && reportedAt > builtAt) {
    return 'checked_in_after_build';
  }

  return null;
}
