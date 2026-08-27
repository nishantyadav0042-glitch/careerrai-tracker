/**
 * ── WHAT HAPPENED TO THIS NOTIFICATION? ─────────────────────────────────────
 *
 * Every notification must end in a state we can name. Until now one could sit
 * in `provider_accepted` forever: the push service took it and no device ever
 * said it arrived. 1,689 rows in 7 days (29.9% of everything accepted) were in
 * that limbo, and "accepted" quietly read as "delivered" on every surface.
 *
 * That is not a failure and must never be reported as one. The honest answer
 * is UNKNOWN — we handed it to the transport and never heard back.
 *
 * THIS IS NOT A RETRY. Nothing here re-sends, and nothing here creates an
 * event. It completes the state machine on the row that already exists, which
 * is the EVENT-OS rule: retry the delivery, never recreate the event.
 *
 * ── The window is measured, not guessed ─────────────────────────────────────
 *
 * Confirmation latency across 14 days of production receipts:
 *   p50 = 6s · p90 = 66min · p99 = 9.8h · max = 28.2h
 *
 * A device offline overnight confirms late; 24h would have called those
 * UNKNOWN while the receipt was still in flight. 48h sits ~1.7x beyond the
 * slowest confirmation ever observed, so an UNKNOWN verdict is safe rather
 * than merely convenient.
 *
 * ── UNKNOWN is reversible, and that is deliberate ───────────────────────────
 *
 * /api/push/received and /api/push/click stamp their timestamps and do NOT
 * touch send_status. So a late receipt would otherwise leave a row that is
 * simultaneously 'unknown' and demonstrably delivered. Proof of arrival
 * therefore OUTRANKS send_status here, permanently: resolveDeliveryState
 * reads the timestamps first and the status second.
 *
 * A tap counts as arrival. metric-registry.ts: "A tap proves delivery — 22 of
 * 43 taps had no received_at." Treating received_at alone as proof would
 * under-count delivery and make the click rate incoherent, because the
 * numerator would not be a subset of the denominator.
 */

/** 48 hours. See the latency evidence above before changing this. */
export const CONFIRMATION_WINDOW_MS = 48 * 60 * 60 * 1000;

export type DeliveryState =
  | 'in_app_only'       // no push was owed — the row is the whole delivery
  | 'accepted_pending'  // transport took it; still inside the confirmation window
  | 'confirmed'         // the device proved it arrived (receipt OR tap)
  | 'unknown'           // window elapsed with no proof either way — an honest answer
  | 'failed';           // the transport refused it, with a reason

/** Only the columns that decide the state. Anything else is irrelevant here. */
export interface DeliveryRow {
  pushed_at: string | null;
  received_at: string | null;
  clicked_at: string | null;
  failed_at: string | null;
}

function ms(t: string | null): number | null {
  if (!t) return null;
  const v = Date.parse(t);
  return Number.isNaN(v) ? null : v;
}

/**
 * The single answer to "what happened to this notification?".
 *
 * Order matters and encodes the precedence: arrival proof, then refusal, then
 * whether a push was owed at all, then the clock.
 */
export function resolveDeliveryState(row: DeliveryRow, nowMs: number): DeliveryState {
  // Proof of arrival outranks everything, including a stale 'unknown' stamp
  // and even a failure record — a device that displayed it received it.
  if (row.received_at || row.clicked_at) return 'confirmed';

  if (row.failed_at) return 'failed';

  // No push attempted. The in-app row IS the delivery; there is nothing
  // outstanding and this must never be counted as an unconfirmed send.
  const pushed = ms(row.pushed_at);
  if (pushed === null) return 'in_app_only';

  return nowMs - pushed >= CONFIRMATION_WINDOW_MS ? 'unknown' : 'accepted_pending';
}

/**
 * Is this row one the sweep should stamp?
 *
 * True only for rows whose state has genuinely settled into 'unknown' and
 * which still claim to be waiting. A row already stamped is not swept again,
 * so the sweep is idempotent and its count means "newly resolved", not
 * "matched".
 */
export function needsUnknownStamp(
  row: DeliveryRow & { send_status: string | null },
  nowMs: number,
): boolean {
  if (row.send_status !== 'provider_accepted') return false;
  return resolveDeliveryState(row, nowMs) === 'unknown';
}

/**
 * The delivery funnel, over rows that a transport was actually meant to carry.
 *
 * Internal bookkeeping rows (channel 'internal' — the dedup markers written by
 * push-recovery, founder-alerts and push.ts) are NOT deliveries and must never
 * sit in this denominator. They never carry pushed_at, so they land in
 * in_app_only rather than distorting the accepted/confirmed ratio, but callers
 * should still filter them out before counting.
 */
export function summariseDelivery(
  rows: DeliveryRow[],
  nowMs: number,
): Record<DeliveryState, number> {
  const out: Record<DeliveryState, number> = {
    in_app_only: 0, accepted_pending: 0, confirmed: 0, unknown: 0, failed: 0,
  };
  for (const r of rows) out[resolveDeliveryState(r, nowMs)] += 1;
  return out;
}
