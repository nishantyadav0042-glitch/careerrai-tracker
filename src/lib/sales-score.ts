// ── The ONE conversion score, and the ONE mock-percentile reader ────────────
//
// Phase 1.5 (24 Aug), debts C2 and C0 from the architecture gate.
//
// C2: this arithmetic existed twice — call-queue.ts ranked the fresh lane with
// it, sales-conversion.ts showed the number on the rep's student page. Two
// hand-copies of one business rule is the same defect class as the three
// weakest-section copies (lib/section-weakness) and the two focus resolvers
// (lib/focus-sections): both copies are individually defensible, nothing looks
// broken on screen, and they drift the first time one is tuned.
//
// C0: mock_debriefs.varc/dilr/qa are JSONB ({percentile: n}), not numbers. The
// sales 360 rendered them straight into JSX, so React — which refuses to
// render an object as a child — 500'd the rep's page for any student who had
// ever logged a mock. Unwrapping lives here so exactly one function knows the
// column's shape, and its output is typed as numbers.

export interface ConversionSignals {
  momentumScore: number;
  buddyTaps: number;
  mockOpened: boolean;
  intentDoor?: boolean;
  /** Studied within the last 3 days. */
  activeRecently: boolean;
}

/**
 * Intent-weighted conversion score. Momentum is the base (a student who
 * studies is a student worth calling); declared buddy intent is the strongest
 * addition, because it is the student's own action rather than our inference.
 */
export function scoreConversion(s: ConversionSignals): number {
  let conv = Math.round(s.momentumScore * 0.35);
  if (s.buddyTaps >= 2) conv += 30;
  else if (s.buddyTaps >= 1) conv += 18;
  if (s.mockOpened) conv += 8;
  if (s.intentDoor) conv += 12;
  if (s.activeRecently) conv += 15;
  return conv;
}

export type ConversionTier = 'hot' | 'warm' | 'cool';

/** Hot = wants a mentor AND is studying now. Both halves matter: intent
 *  without activity goes stale, activity without intent is not a sale yet. */
export function conversionTier(s: ConversionSignals): ConversionTier {
  if (s.buddyTaps >= 1 && s.activeRecently) return 'hot';
  if (s.buddyTaps >= 1 || s.mockOpened || s.momentumScore >= 50) return 'warm';
  return 'cool';
}

/** A percentile a rep may read aloud. Production holds a real row with
 *  dilr {percentile: -2}; a negative percentile is not a fact about a
 *  student, so it renders as absent rather than as a wrong number. */
function percentile(v: unknown): number | null {
  const n = typeof v === 'number' ? v : v == null ? null : Number(v);
  if (n == null || !Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

export interface MockPercentiles {
  varc: number | null; dilr: number | null; qa: number | null; overall: number | null;
}

/** THE reader for mock_debriefs' JSONB section columns. Every sales surface
 *  goes through this rather than reaching into the column shape itself.
 *
 *  The input is deliberately untyped: this is a BOUNDARY reader whose job is
 *  to turn whatever the database actually holds — an object, a null, a legacy
 *  bare number, a missing key — into a number a rep can safely read aloud.
 *  Typing the input tightly would move the lie one layer up rather than
 *  catching it here. (`DebriefRow` remains the shape this expects to see.) */
export function mockPercentiles(
  row: Record<string, unknown> | null | undefined,
  overall: unknown,
): MockPercentiles {
  return {
    varc: percentile((row?.varc as { percentile?: unknown } | null | undefined)?.percentile),
    dilr: percentile((row?.dilr as { percentile?: unknown } | null | undefined)?.percentile),
    qa: percentile((row?.qa as { percentile?: unknown } | null | undefined)?.percentile),
    overall: percentile(overall),
  };
}
