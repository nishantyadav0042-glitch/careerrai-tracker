// All student-facing motivational copy — edit here, nothing to update in components.
//
// CAT_FACTS (14 tips), getComebackHeadline and getComebackBody were deleted in
// the 14 Aug dead-code sweep. All three had zero consumers anywhere in the repo
// — not a surface, not a notification, not a test. They were the copy half of
// the streak-celebration screen that PlanRebuildPayoff replaced: the component
// went, the strings stayed. Copy nothing renders is not a copy library, it is a
// pile of sentences that reads as shipped product to the next person who opens
// this file.
//
// MILESTONE_MESSAGES stays because it IS live — api/logging/log-daily reads it
// on every log to decide whether the student just crossed 7, 15 or 30 days.

/** The three streak values that earn a named milestone, keyed by day count. */
export const MILESTONE_MESSAGES: Record<number, string> = {
  7:  '7 days straight. This is the consistency you were looking for.',
  15: '15 days in. You\'re proving it — the ability was always there, now the discipline is too.',
  30: 'A full month. This is the version of you that cracks CAT.',
};
