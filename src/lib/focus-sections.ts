import { weakestFromCoverage } from './section-weakness';
import { mockInformedFocus, type DebriefRow } from './mock-informed-focus';
import type { Section } from './prep-model';

// ── Which section the plan attacks, decided in ONE place ────────────────────
//
// Founder, 14 Aug: "There must never be two competing authoritative study
// plans... If two systems can independently generate today's study plan,
// investigate immediately."
//
// This module exists because they could, and did. `weakestSection` is not a
// label — it drives dayShape (which section takes the 40–55% priority slice
// and leads the day) and buildTopicChoices (isWeakSection, selfReportedBonus).
// Change it and the entire day changes.
//
// There are exactly two writers of daily_routines, and until now they resolved
// it differently:
//
//   api/routine/today   mock → self-report → baseline → coverage → DILR
//   lib/routine-plan    ......  self-report → baseline → coverage → DILR
//
// The cron had no mock branch at all. So for any student whose latest mock
// disagreed with what they typed at signup, the two writers built genuinely
// different task lists for the same student and the same date, and whichever
// ran first froze the day. Both plans were individually defensible, which is
// what makes this the dangerous kind of bug: nothing looks broken on screen.
//
// Measured 14 Aug: 0 students were actually diverging, because only one
// student had a complete recent mock and none of them had also self-reported
// a weakest section. It was latent, not live — and it would have gone live the
// moment mock logging picked up, which is exactly the direction the product is
// being pushed. A latent split-brain is still a split-brain.
//
// The baseline helpers were also two hand-copied implementations of the same
// arithmetic, one in each caller. Both are folded in here.

interface BaselineProfile {
  baseline_varc?: unknown;
  baseline_dilr?: unknown;
  baseline_qa?: unknown;
  self_reported_weakest_section?: unknown;
  self_reported_strongest_section?: unknown;
}

function baselineScores(p: BaselineProfile): { s: Section; v: number }[] {
  return [
    { s: 'VARC' as const, v: p.baseline_varc as number | null },
    { s: 'DILR' as const, v: p.baseline_dilr as number | null },
    { s: 'QA' as const, v: p.baseline_qa as number | null },
  ].filter((x): x is { s: Section; v: number } => x.v != null);
}

/** Lowest baseline percentile. Null under two scores — one number ranks nothing. */
export function weakestFromBaseline(p: BaselineProfile): Section | null {
  const scores = baselineScores(p);
  if (scores.length < 2) return null;
  return scores.reduce((a, b) => (b.v < a.v ? b : a)).s;
}

/** Highest baseline percentile. Same two-score floor. */
export function strongestFromBaseline(p: BaselineProfile): Section | null {
  const scores = baselineScores(p);
  if (scores.length < 2) return null;
  return scores.reduce((a, b) => (b.v > a.v ? b : a)).s;
}

export type WeakestSource = 'mock' | 'self_report' | 'baseline' | 'coverage' | 'default';

export interface FocusSections {
  weakest: Section;
  /**
   * WHICH rung of the evidence ladder produced `weakest`. Added for Buddy
   * matching (Batch 8): a consumer that presents the weakest section back to
   * the student as personalisation must know whether it came from evidence or
   * from the hard 'DILR' default at the bottom of the chain -- a default is
   * not a fact about the student, and claiming it as one is the defect class
   * this codebase keeps paying for. The plan engine itself ignores this field.
   */
  weakestSource: WeakestSource;
  strongest: Section | null;
  /** Set when a mock decided it — the plan may only claim this when true. */
  mockBasis: string | null;
  /** The date of the mock that decided it, for the freshness rule. */
  mockTakenOn: string | null;
}

/**
 * THE resolution both plan writers use.
 *
 * Order is evidence-first and deliberate: a recent, complete, decisive mock
 * outranks what a student guessed at signup, because it is measured. Below
 * that, the self-report outranks a baseline they also typed, which outranks
 * a coverage grid they may never have filled.
 *
 * `todayIso` must be the student's study day (getLogDateString), not a raw
 * UTC date — mockInformedFocus uses it for both the age window and the
 * "was this mock taken today?" freshness rule.
 */
export function resolveFocusSections(
  profile: BaselineProfile,
  coverageRows: { section: string; status: string }[],
  debriefRows: DebriefRow[],
  todayIso: string,
): FocusSections {
  const mock = mockInformedFocus(debriefRows, todayIso);
  // The chain, written once and read twice: the value falls through it, and
  // the source names the rung that answered. Keeping the literal chain intact
  // matters -- two guard tests pin mock above self-report by reading this body.
  const weakest = mock?.weakest
    ?? (profile.self_reported_weakest_section as Section | null)
    ?? weakestFromBaseline(profile)
    ?? weakestFromCoverage(coverageRows)
    ?? 'DILR';
  const weakestSource: WeakestSource =
    mock ? 'mock'
    : profile.self_reported_weakest_section ? 'self_report'
    : weakestFromBaseline(profile) ? 'baseline'
    : weakestFromCoverage(coverageRows) ? 'coverage'
    : 'default';
  return {
    weakest,
    weakestSource,
    strongest: mock?.strongest
      ?? (profile.self_reported_strongest_section as Section | null)
      ?? strongestFromBaseline(profile),
    // Suppressed on the day the mock was entered: today's routine froze
    // BEFORE that score existed, and this line may only render when it is
    // true of the plan on screen (the plan-reason rule).
    mockBasis: mock && mock.takenOn < todayIso ? mock.basis : null,
    mockTakenOn: mock?.takenOn ?? null,
  };
}
