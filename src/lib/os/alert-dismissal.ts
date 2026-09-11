// ── Which alerts has the founder already dealt with? ────────────────────────
//
// Founder, 6 Sep 2026: "add a close button also here... so that I can tap
// already assigned or completed."
//
// Sacred alerts are recomputed from live data every time the page loads, so an
// alert whose fix happened OUTSIDE the system — a mentor assigned by hand, a
// student called and sorted — has no way to stop firing. It comes back every
// morning looking new. The founder had already met that failure once: the
// three money alerts that could never clear became noise he scrolled past.
//
// So dismissal is a separate, tiny fact: the founder's judgement that this
// alert is handled. It never edits the payment, the profile, or the mentor
// link — the drill-down keeps telling the truth, and any other surface reading
// that data still sees the real state.

/** The two the founder asked for, plus an escape hatch that needs no migration. */
export type DismissReason = 'assigned' | 'completed' | 'other';

export const DISMISS_REASONS: readonly DismissReason[] = ['assigned', 'completed', 'other'];

export function isDismissReason(v: unknown): v is DismissReason {
  return typeof v === 'string' && (DISMISS_REASONS as readonly string[]).includes(v);
}

/** What the founder sees on the button, and what the row will mean later. */
export const DISMISS_LABEL: Record<DismissReason, string> = {
  assigned: 'Already assigned',
  completed: 'Completed',
  other: 'Not a problem',
};

/**
 * The alert's kind, taken from its own id prefix.
 *
 * Producers already build ids as `<kind>:<subject>` (`unlock:<paymentId>`,
 * `buddy:<studentId>`, `sacred-fail:<action>:<window>`). Reading the kind from
 * the id rather than asking the caller to pass one means the two can never
 * disagree — a caller that mislabels a dismissal would make the founder's
 * "what have I been closing" view quietly wrong.
 */
export function alertKind(alertId: string): string {
  const i = alertId.indexOf(':');
  return i === -1 ? alertId : alertId.slice(0, i);
}

/**
 * Remove the alerts the founder has already closed.
 *
 * Pure, and takes the dismissed set rather than reading it, so the ordering
 * and severity rules in findSacredFailures stay the single authority on what
 * an alert list looks like — this only subtracts.
 */
export function withoutDismissed<T extends { id: string }>(
  alerts: T[], dismissedIds: ReadonlySet<string>,
): T[] {
  return alerts.filter((a) => !dismissedIds.has(a.id));
}

/**
 * Read the closed set.
 *
 * A FAILED READ RETURNS EMPTY, and that is the deliberate direction: if this
 * table cannot be read we show the founder MORE alerts than necessary, never
 * fewer. The opposite default would let a database hiccup hide a live money
 * problem — silence that looks like a calm day is the one outcome this whole
 * subsystem exists to prevent.
 */
export async function readDismissedIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: { from: (t: string) => any },
): Promise<Set<string>> {
  try {
    const { data, error } = await admin
      .from('founder_alert_dismissals').select('alert_id');
    if (error) {
      console.error('[alert-dismissal] read failed, showing all alerts:', error.message);
      return new Set();
    }
    return new Set(((data ?? []) as Array<{ alert_id: string }>).map((r) => r.alert_id));
  } catch (e) {
    console.error('[alert-dismissal] read threw, showing all alerts:', String(e));
    return new Set();
  }
}
