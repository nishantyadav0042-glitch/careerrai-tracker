// ── Notification → click → app-open → action attribution ─────────────────
//
// Notification Reliability V2, Installment 4, Batch B.
//
// The founder's own rule, applied literally: "If causality cannot be
// proven, call it CORRELATED, not ACTED." This codebase does not (yet)
// thread the notification's own id through every action-completion call
// site — logging a day, opening the plan, finishing the Builder — so there
// is no hard wire from "this specific tap" to "this specific action". That
// would require touching every one of those call sites, a much broader
// change than this pass makes. The honest conclusion, not a compromise:
// this classifier can NEVER emit "acted", only 'correlated' (strong
// temporal link to a proven app-open), 'not_attributed' (the causality
// rules below rule it out), or 'unknown' (nothing to check against).

export type AttributionVerdict = 'correlated' | 'not_attributed' | 'unknown';

export interface AttributionInput {
  /** notifications.created_at for the notification in question. */
  notificationCreatedAt: string;
  /** notifications.clicked_at — null if never tapped. */
  clickedAt: string | null;
  /** notifications.app_opened_at — null unless the app-open beacon fired
   *  with THIS notification's own id (see notification-attribution.tsx). */
  appOpenedAt: string | null;
  /** When the candidate expected_action was actually completed — null if
   *  it never was (as of whenever this is evaluated). */
  actionCompletedAt: string | null;
  /** How long after app-open a completion still counts as linked. Default
   *  30 minutes: long enough for a real study session, short enough that
   *  "logged three days later" can't retroactively claim this notification. */
  windowMinutes?: number;
}

export function classifyActionAttribution(input: AttributionInput): AttributionVerdict {
  if (input.actionCompletedAt == null) return 'unknown'; // nothing happened (yet) to judge

  // Action before the notification even existed: never attributable,
  // regardless of anything else — the founder's rule, applied literally.
  if (Date.parse(input.actionCompletedAt) < Date.parse(input.notificationCreatedAt)) return 'not_attributed';

  // The founder's required chain is click → app open → action. No click,
  // no app-open — no correlation, no matter how well-timed the action was.
  if (input.clickedAt == null || input.appOpenedAt == null) return 'not_attributed';

  const openedAt = Date.parse(input.appOpenedAt);
  const completedAt = Date.parse(input.actionCompletedAt);
  const windowMs = (input.windowMinutes ?? 30) * 60_000;

  if (completedAt < openedAt) return 'not_attributed'; // action logged before this specific app-open, even if after the notification
  if (completedAt - openedAt > windowMs) return 'not_attributed'; // too far past this app-open to plausibly be its consequence

  return 'correlated';
}
