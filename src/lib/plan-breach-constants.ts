// Split out so plan-breach.ts stays a pure computation with no cycles.

/**
 * Days of silence past which the debt is treated as unrecoverable within the
 * current target — the point where the honest move is a replan, not a nudge.
 * Matches the founder's "ignores the plan for 10 days" case (5 Aug).
 */
export const REPLAN_DEBT_UNRECOVERABLE_DAYS = 10;
