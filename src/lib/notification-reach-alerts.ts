// ── The alarm that should have gone off on 10 August ────────────────────────
//
// On 10 Aug the iOS install route changed to the App Store wrapper. Apple Web
// Push acquisition did not decline — it went to ZERO, on a surface that had
// been converting all through July. Nobody found out for three weeks, and only
// then because a founder asked why reach was low.
//
// The whole point of this module is that "a surface that used to convert now
// converts nothing" is a LOUD, MECHANICAL signal. It needs no analyst, no
// dashboard someone remembers to open, and no aggregate — an overall average
// would have hidden it completely, because Android kept converting normally
// the entire time.
//
// DETECTION IS PURE. The data fetch lives in the cron; every threshold and
// every decision is a plain function over plain numbers, so the 10 Aug
// collapse can be replayed against it as a test — and is.
//
// One authority: this decides WHEN to alarm. It does not send anything, does
// not query anything, and does not duplicate notification-health.ts (which
// scores INDIVIDUAL students). This scores SURFACES.

/** The four surfaces, named exactly as the reach audit names them. */
export type ReachSurface = 'android_pwa' | 'ios_pwa' | 'ios_wrapper' | 'desktop_pwa';

/** One surface's funnel over a window, plus the previous window for comparison. */
export interface SurfaceWindow {
  surface: ReachSurface;
  /** Students active on this surface who COULD hold a subscription. */
  capableStudents: number;
  /** `push_enabled` events in the current window. */
  newSubscriptions: number;
  /** …and in the window before it. */
  prevNewSubscriptions: number;
  /** Endpoints with a receipt inside the verification window. */
  verifiedEndpoints: number;
  prevVerifiedEndpoints: number;
  /**
   * null means NOT MEASURED, which is different from zero. A failed or skipped
   * query must never be able to raise a P0 "nothing was sent" alarm — that is
   * how an alert channel earns distrust on its first week.
   */
  sendAttempted: number | null;
  providerAccepted: number | null;
  swReceived: number | null;
  /** Subscriptions that died (410/404) in the current window. */
  died: number;
  prevDied: number;
}

export type AnomalyKind =
  | 'surface_acquisition_stopped'   // the 10 Aug failure, exactly
  | 'acquisition_dropped'
  | 'reach_dropped'
  | 'sends_stopped'
  | 'provider_rejection_spike'
  | 'receipt_rate_dropped'
  | 'death_spike';

export interface ReachAnomaly {
  kind: AnomalyKind;
  surface: ReachSurface;
  /** Which funnel stage broke — never just "notifications are down". */
  stage: string;
  detail: string;
  severity: 'P0' | 'P1';
}

// ── Thresholds ─────────────────────────────────────────────────────────────
//
// Every one has a MINIMUM POPULATION guard. A surface with 13 students will
// swing wildly week to week, and an alert that cries wolf gets muted, which is
// worse than no alert. These are deliberately conservative: we would rather
// miss a small wobble than train the founder to ignore the alarm.

/** A surface must have at least this many capable students to be judged. */
const MIN_CAPABLE = 20;
/** …and must have converted at least this many last window to call a stop. */
const MIN_PRIOR_CONVERSIONS = 3;
const ACQUISITION_DROP_PCT = 0.7;   // −70% week over week
const REACH_DROP_PCT = 0.15;        // −15% verified endpoints
const MIN_SENDS_FOR_RATES = 50;     // rate checks need volume to mean anything
const MIN_RECEIPT_RATE = 0.6;       // we observe ~92%; 60% is a real collapse
const MAX_REJECTION_RATE = 0.3;
const DEATH_SPIKE_MULTIPLE = 3;

const pct = (n: number, d: number) => (d > 0 ? n / d : 0);

/**
 * Pure. Given each surface's window, return every anomaly worth waking someone
 * for. Empty array is the normal, healthy answer.
 */
export function detectReachAnomalies(windows: readonly SurfaceWindow[]): ReachAnomaly[] {
  const out: ReachAnomaly[] = [];

  for (const w of windows) {
    // ── THE 10 AUGUST CHECK ──────────────────────────────────────────────
    // A surface with a real population that used to convert and now converts
    // NOTHING. This is P0 because it is almost always a routing or capability
    // regression, not student behaviour — students do not all stop at once.
    if (w.capableStudents >= MIN_CAPABLE
        && w.prevNewSubscriptions >= MIN_PRIOR_CONVERSIONS
        && w.newSubscriptions === 0) {
      out.push({
        kind: 'surface_acquisition_stopped',
        surface: w.surface,
        stage: 'permission → subscription',
        detail: `${w.surface}: ${w.capableStudents} capable students, ${w.prevNewSubscriptions} new subscriptions last window, ZERO this window. A surface that converted has stopped entirely.`,
        severity: 'P0',
      });
    } else if (w.capableStudents >= MIN_CAPABLE
        && w.prevNewSubscriptions >= MIN_PRIOR_CONVERSIONS
        && w.newSubscriptions < w.prevNewSubscriptions * (1 - ACQUISITION_DROP_PCT)) {
      out.push({
        kind: 'acquisition_dropped',
        surface: w.surface,
        stage: 'permission → subscription',
        detail: `${w.surface}: new subscriptions fell ${w.prevNewSubscriptions} → ${w.newSubscriptions}.`,
        severity: 'P1',
      });
    }

    // Reach itself falling — the primary metric moving the wrong way.
    if (w.prevVerifiedEndpoints >= MIN_CAPABLE
        && w.verifiedEndpoints < w.prevVerifiedEndpoints * (1 - REACH_DROP_PCT)) {
      out.push({
        kind: 'reach_dropped',
        surface: w.surface,
        stage: 'healthy endpoint',
        detail: `${w.surface}: verified endpoints ${w.prevVerifiedEndpoints} → ${w.verifiedEndpoints}.`,
        severity: 'P0',
      });
    }

    // A surface with reachable students that received nothing at all: the
    // cron/eligibility side, distinct from every acquisition signal above.
    if (w.verifiedEndpoints >= MIN_PRIOR_CONVERSIONS && w.sendAttempted === 0 && w.sendAttempted !== null) {
      out.push({
        kind: 'sends_stopped',
        surface: w.surface,
        stage: 'eligible send',
        detail: `${w.surface}: ${w.verifiedEndpoints} reachable students and ZERO send attempts.`,
        severity: 'P0',
      });
    }

    // Rate checks only where there is enough volume for a rate to mean anything.
    if (w.sendAttempted !== null && w.providerAccepted !== null && w.sendAttempted >= MIN_SENDS_FOR_RATES) {
      const rejection = 1 - pct(w.providerAccepted, w.sendAttempted);
      if (rejection > MAX_REJECTION_RATE) {
        out.push({
          kind: 'provider_rejection_spike',
          surface: w.surface,
          stage: 'provider accept',
          detail: `${w.surface}: ${Math.round(rejection * 100)}% of sends rejected by the push provider.`,
          severity: 'P0',
        });
      }
    }
    if (w.providerAccepted !== null && w.swReceived !== null && w.providerAccepted >= MIN_SENDS_FOR_RATES) {
      const receipt = pct(w.swReceived, w.providerAccepted);
      if (receipt < MIN_RECEIPT_RATE) {
        out.push({
          kind: 'receipt_rate_dropped',
          surface: w.surface,
          stage: 'service worker receive',
          detail: `${w.surface}: only ${Math.round(receipt * 100)}% of accepted pushes reached a service worker (normally ~92%).`,
          severity: 'P1',
        });
      }
    }

    if (w.prevDied >= MIN_PRIOR_CONVERSIONS && w.died > w.prevDied * DEATH_SPIKE_MULTIPLE) {
      out.push({
        kind: 'death_spike',
        surface: w.surface,
        stage: 'healthy endpoint',
        detail: `${w.surface}: subscriptions dying ${w.prevDied} → ${w.died}.`,
        severity: 'P1',
      });
    }
  }
  return out;
}

/**
 * A surface that CANNOT receive is not an anomaly and must never alarm.
 * `ios_wrapper` converts zero every single window, by architecture — alerting
 * on it daily is exactly how an alert channel becomes noise and gets ignored.
 */
export function alertableSurfaces(windows: readonly SurfaceWindow[]): SurfaceWindow[] {
  return windows.filter((w) => w.surface !== 'ios_wrapper');
}
