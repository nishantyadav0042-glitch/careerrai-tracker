// ── The Insight → Plan handoff ───────────────────────────────────────────────
//
// Founder, 15 Aug, after reviewing the self-report fix: "Instant Insight can
// now be correct, but the student can still experience two different
// CareerRai truths immediately afterward." Example: onboarding says "VARC is
// my weakness," Instant Insight says "we noticed a QA foundation gap," the
// real plan (resolveFocusSections, which correctly ranks self-report above
// coverage) opens with VARC. Nothing told the student why Insight and Plan
// disagreed — a new shape of the exact trust problem the self-report fix
// solved for the onboarding screen itself.
//
// THIS MODULE DOES NOT DECIDE THE PLAN. It does not recompute detectors, it
// does not touch `resolveFocusSections()`, and it never overrides the
// existing evidence hierarchy (performance > self-report > baseline >
// coverage) — that hierarchy is correct and stays authoritative. This module
// only COMPARES three already-known things — what the student actually told
// us, what Instant Insight showed at signup (persisted, never recomputed),
// and what the plan already decided today — and produces a plain-language
// explanation when Insight and Plan differ. Insight engine answers "what
// should the student KNOW"; the plan engine answers "what should the
// student DO"; this is the seam between them, not a third engine.
//
// The comparison is deliberately NOT cached — the plan's actual focus
// changes day to day (a fresh mock can override it, per mockInformedFocus),
// so "aligned" computed once at signup would go stale. This runs fresh
// wherever it's needed (today: api/routine/today/route.ts).
//
// Pre-commit review, 15 Aug — three corrections made here directly because
// they were caught before anything shipped, not after:
//   1. The copy used to say "stays on record" / implied "alignment" — jargon
//      a student has no reason to understand. Rewritten to the three-part
//      shape the founder specified: you told us → we noticed → here's what
//      today's plan is doing, in plain sentences, no technical vocabulary.
//   2. The "you told us X" line used to be inferred from the INSIGHT's own
//      `source` field — wrong, because a discovery-sourced insight
//      (source: 'careerrai') can still coexist with a real, different
//      self-report the student actually gave. "What the student told us"
//      and "what CareerRai's shown insight was" are two separate facts and
//      are now passed in separately.
//   3. Added `normalizeInsight` so a malformed/legacy DB value (anything
//      outside VARC/DILR/QA or student/careerrai) can never reach the
//      comparison as if it were real — fails closed to "nothing to
//      disclose" rather than rendering garbage or crashing.

import type { CoreSection } from './prep-insight-engine';
import type { SelfReportStatus } from './prep-insight-engine';

const VALID_SECTIONS: CoreSection[] = ['VARC', 'DILR', 'QA'];
const VALID_SOURCES = ['student', 'careerrai'] as const;

/** What was persisted at signup — the literal fields on `profiles`, never
 *  recomputed here. See supabase/migrations/20260815b_instant_insight_handoff.sql. */
export interface PersistedInsight {
  section: CoreSection | null;
  topic: string | null;
  /** Was the shown finding a validation of the student's own self-report, or
   *  something CareerRai found independently? Kept for classification/
   *  telemetry — the disclosure copy's "you told us" line does NOT read
   *  this; it reads the actual self-report (see `insightDisclosure`'s
   *  `selfReport` parameter), because the two can legitimately differ. */
  source: 'student' | 'careerrai' | null;
  rootCause: string | null;
  /** The short "what we'll do" phrase already shown on Instant Insight —
   *  reused verbatim so the disclosure never contradicts what the student
   *  already read (final spec Part I: never invent new claims post hoc). */
  recommend: string | null;
}

/** What the student actually answered — independent of what Instant Insight
 *  went on to show. A NOT_SURE_YET student can still receive a careerrai-
 *  sourced insight; a VARC self-reporter can still receive a QA discovery. */
export interface SelfReportState {
  section: CoreSection | null;
  status: SelfReportStatus;
}

export type InsightPlanAlignment = 'ALIGNED' | 'DIFFERENT_BUT_VALID';

/** Coerces a raw (possibly malformed, possibly legacy/pre-migration) DB read
 *  into a value this module will actually trust — anything outside the
 *  known enum fails closed to null rather than propagating garbage. Call
 *  this at the read boundary (the API route), not deep inside the compare
 *  functions, so every caller gets the same fail-closed guarantee for free. */
export function normalizeInsight(raw: {
  section?: unknown; topic?: unknown; source?: unknown; rootCause?: unknown; recommend?: unknown;
}): PersistedInsight {
  const section = VALID_SECTIONS.includes(raw.section as CoreSection) ? (raw.section as CoreSection) : null;
  const source = VALID_SOURCES.includes(raw.source as 'student' | 'careerrai') ? (raw.source as 'student' | 'careerrai') : null;
  return {
    section,
    topic: typeof raw.topic === 'string' && raw.topic.length > 0 ? raw.topic : null,
    source,
    rootCause: typeof raw.rootCause === 'string' && raw.rootCause.length > 0 ? raw.rootCause : null,
    // A recommend string with no valid section is not attributable to
    // anything real — drop it too, rather than disclosing a fact with no
    // section to hang it on.
    recommend: section && typeof raw.recommend === 'string' && raw.recommend.length > 0 ? raw.recommend : null,
  };
}

/**
 * Null means "nothing to compare" — no insight was persisted (pre-mandate
 * history, a strength-only/insufficient-evidence Instant Insight visit, or a
 * malformed section value normalized away) — this is NOT the same as
 * DIFFERENT_BUT_VALID, and must render nothing rather than a confusing
 * comparison against nothing real (Case 6: never promise or disclose about
 * a finding that was never actually shown).
 */
export function determineAlignment(insight: PersistedInsight, planSection: CoreSection): InsightPlanAlignment | null {
  if (!insight.section) return null;
  return insight.section === planSection ? 'ALIGNED' : 'DIFFERENT_BUT_VALID';
}

/**
 * The disclosure line — ONLY when Insight and Plan genuinely differ, in the
 * plain three-part shape the founder specified: what the student told us
 * (if anything) → what CareerRai separately noticed → what today's plan is
 * actually doing and why. No "alignment," "source," "root cause," "stays on
 * record," or any other internal vocabulary. No promise about a future day
 * — `resolveFocusSections` recomputes fresh every day from the same
 * evidence hierarchy and does not queue "QA next," so the honest claim
 * stops at what is true right now.
 */
export function insightDisclosure(insight: PersistedInsight, planSection: CoreSection, selfReport: SelfReportState): string | null {
  if (determineAlignment(insight, planSection) !== 'DIFFERENT_BUT_VALID') return null;
  if (!insight.section) return null;

  const parts: string[] = [];

  // Part 1 — what the student actually told us, if anything. Reads the REAL
  // self-report, never inferred from the insight's own `source` field (see
  // the file header's correction #2) — omitted entirely for NOT_SURE_YET or
  // no self-report, so the copy never fabricates "you told us" for a
  // student who never named a section.
  if (selfReport.status === 'SELECTED_SECTION' && selfReport.section) {
    parts.push(`You told us ${selfReport.section} feels weakest.`);
  }

  // Part 2 — what CareerRai separately noticed, stated as a plain fact with
  // the specific action attached (reusing the exact `recommend` string
  // already shown, per final spec Part I — never a new claim).
  const noticedWhat = insight.recommend ?? (insight.topic ? `${insight.topic} needs attention` : 'a gap worth knowing about');
  parts.push(`We also noticed something in ${insight.section}: ${noticedWhat}.`);

  // Part 3 — what today's plan is doing, and the one honest reason: it's
  // the strongest signal available right now. No jargon, no promise about
  // tomorrow.
  parts.push(`For today, we're prioritising ${planSection} — that's the strongest signal we have about where you need attention right now.`);

  return parts.join(' ');
}
