// ── CareerRai Evidence Layer: mock evidence ─────────────────────────────────
//
// The first objective evidence source. Everything else CareerRai knows about a
// student is something the student TOLD us: 31,658 topic-coverage opinions,
// 400 daily logs, 368 task ticks. Four intelligence modules run on that and
// not one of them has ever consumed a measured fact. This module exists to
// change the input, not to add another engine.
//
// ── The 22 Aug audit that shaped it ─────────────────────────────────────────
//
// Three seductive claims died in the audit and must never come back:
//
//   TIME SINK. "Low attempted plus high time means they sank the clock into
//   one set" — time_min is stored PER SECTION. A single set costing fourteen
//   minutes is invisible to us. We cannot see it, so we do not say it.
//
//   SILLY TRAP. "High attempted plus low correct means careless errors" —
//   low accuracy has at least four causes: concept gaps, guessing, the
//   difficulty mix of the questions picked, and selection. A section-level
//   ratio cannot distinguish them. We report the ratio and refuse the cause.
//
//   "12 OF 22". The repo holds no CAT section-size metadata, and mock
//   providers vary. A denominator we did not measure is a denominator we
//   invented, so attempt volume is only ever compared against the student's
//   OWN other sections — never against a number we made up.
//
// ── The confidence contract (founder ruling, 22 Aug) ────────────────────────
//
// Every item carries `confidence` as first-class data, and the STUDENT NEVER
// SEES THE LABEL. A clinical "INFERENCE" badge on every sentence is not
// honesty, it is decoration. The honesty lives in the sentence itself:
//
//   fact       stated plainly, no hedge. Hedging a measured number makes the
//              system look unsure of what it actually knows.
//   inference  the uncertainty is IN the sentence, and the sentence names
//              what it cannot rule out. Never "you have a selection problem";
//              always "one possible reason is selection, but this scorecard
//              cannot tell us why".
//   unknown    says out loud what the system cannot see, rather than leaving
//              the student to assume we saw everything.
//
// The binding rule: AN INFERENCE MAY NEVER SOUND MORE CERTAIN THAN ITS
// EVIDENCE. Guard tests below pin that to the text, not to a comment.
//
// One deviation from the audit memo, stated openly: the memo filed
// accuracy = correct/attempted under `inference`. It is implemented here as
// `fact`. Dividing two measured numbers introduces no assumption — it is a
// restatement, not a claim. Filing it as inference would force the engine to
// hedge a certainty ("your accuracy appears to be 100%"), which erodes trust
// in the opposite direction and drains the word `inference` of meaning.
// `inference` is reserved for statements about what the numbers MEAN.

export type Confidence = 'fact' | 'inference' | 'unknown';

export type SectionKey = 'varc' | 'dilr' | 'qa';

export const SECTION_LABEL: Record<SectionKey, string> = {
  varc: 'VARC',
  dilr: 'DILR',
  qa: 'QA',
};

/** A section exactly as mock_debriefs stores it. Every field is optional
 *  because a hand-typed mock may carry only a percentile — 14 of the 24 mocks
 *  we hold do. Absence is a real state, never a zero. */
export interface MockSection {
  percentile?: number | null;
  attempted?: number | null;
  correct?: number | null;
  time_min?: number | null;
}

export interface MockRow {
  overall_percentile?: number | null;
  varc?: MockSection | null;
  dilr?: MockSection | null;
  qa?: MockSection | null;
}

export interface EvidenceItem {
  /** Stable id so downstream engines rank and dedupe without parsing prose. */
  id: string;
  confidence: Confidence;
  /** Null when the item concerns the paper as a whole. */
  section: SectionKey | null;
  /** The machine-readable numbers. Callers must read these, never re-parse
   *  `text` — the sentence is for the student, the data is for the system. */
  data: Record<string, number | null>;
  /** Student-facing sentence, hedged at source. Callers must not soften or
   *  strengthen it; the confidence is already built into the wording. */
  text: string;
}

export interface MockEvidence {
  items: EvidenceItem[];
  /** True when at least one section carried both attempted and correct.
   *  False means this mock is a scoreboard, not evidence — the honest state
   *  for every mock logged in August, when the client discarded the fields. */
  hasMeasuredAbility: boolean;
}

// ── Thresholds ──────────────────────────────────────────────────────────────
//
// Same doctrine as mock-informed-focus's MIN_GAP: a ratio built on a handful
// of attempts is noise, and steering a student on noise is worse than saying
// nothing. Two of two correct is not "100% accuracy", it is two questions.

/** Below this many attempts a section ratio is not reported at all. */
export const MIN_ATTEMPTS_FOR_RATIO = 5;
/** At or above this, accuracy was not the limiting factor on what was tried. */
export const HIGH_ACCURACY = 0.85;
/** At or below this, more of what was attempted went wrong than right. */
export const LOW_ACCURACY = 0.6;
/** Attempt-count gap between two sections worth naming to the student. */
export const VOLUME_GAP = 6;

const SECTIONS: SectionKey[] = ['varc', 'dilr', 'qa'];

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

interface Measured {
  section: SectionKey;
  attempted: number;
  correct: number;
  accuracy: number;
}

/** Sections carrying BOTH attempted and correct, the only pair that measures
 *  ability. A section with attempted but no correct tells us effort, not
 *  outcome, and is deliberately dropped rather than half-used. */
function measuredSections(mock: MockRow): Measured[] {
  const out: Measured[] = [];
  for (const key of SECTIONS) {
    const s = mock[key];
    if (!s) continue;
    const attempted = num(s.attempted);
    const correct = num(s.correct);
    if (attempted === null || correct === null) continue;
    if (attempted <= 0) continue;
    if (correct < 0 || correct > attempted) continue; // impossible row, not evidence
    out.push({ section: key, attempted, correct, accuracy: correct / attempted });
  }
  return out;
}

export function readMockEvidence(mock: MockRow | null | undefined): MockEvidence {
  const items: EvidenceItem[] = [];
  if (!mock) return { items, hasMeasuredAbility: false };

  const measured = measuredSections(mock);

  // ── FACT: what the scorecard printed, stated plainly ──────────────────────
  for (const m of measured) {
    const label = SECTION_LABEL[m.section];
    const pct = Math.round(m.accuracy * 100);
    items.push({
      id: `mock.attempts.${m.section}`,
      confidence: 'fact',
      section: m.section,
      data: { attempted: m.attempted, correct: m.correct, accuracy_pct: pct },
      text: `In ${label} you attempted ${m.attempted} and got ${m.correct} right — ${pct}% of what you touched.`,
    });
  }

  // ── INFERENCE: what those numbers might mean, hedged at source ────────────
  for (const m of measured) {
    if (m.attempted < MIN_ATTEMPTS_FOR_RATIO) continue;
    const label = SECTION_LABEL[m.section];
    if (m.accuracy >= HIGH_ACCURACY) {
      items.push({
        id: `mock.accuracy_not_constraint.${m.section}`,
        confidence: 'inference',
        section: m.section,
        data: { attempted: m.attempted, correct: m.correct },
        text: `Accuracy does not look like what held you back in ${label} on this mock — what you attempted, you mostly got right. Whether attempting more would have scored more, this scorecard cannot say.`,
      });
    } else if (m.accuracy <= LOW_ACCURACY) {
      items.push({
        id: `mock.accuracy_low.${m.section}`,
        confidence: 'inference',
        section: m.section,
        data: { attempted: m.attempted, correct: m.correct },
        text: `In ${label} more of what you attempted went wrong than right. This scorecard cannot tell us why — it could be the concepts, guessing, or the mix of questions you picked.`,
      });
    }
  }

  // ── Volume, compared only against the student's own other sections ────────
  if (measured.length >= 2) {
    const sorted = [...measured].sort((a, b) => b.attempted - a.attempted);
    const most = sorted[0];
    const least = sorted[sorted.length - 1];
    if (most.attempted - least.attempted >= VOLUME_GAP) {
      items.push({
        id: 'mock.volume.spread',
        confidence: 'fact',
        section: null,
        data: { most: most.attempted, least: least.attempted },
        text: `You attempted ${most.attempted} in ${SECTION_LABEL[most.section]} and ${least.attempted} in ${SECTION_LABEL[least.section]}.`,
      });
      items.push({
        id: `mock.volume.low.${least.section}`,
        confidence: 'inference',
        section: least.section,
        data: { attempted: least.attempted, other: most.attempted },
        text: `Your attempt volume in ${SECTION_LABEL[least.section]} is well below your other sections. One possible reason is question selection, but this scorecard cannot tell us why.`,
      });
    }
  }

  // ── UNKNOWN: say what we cannot see, every time ───────────────────────────
  if (measured.length === 0) {
    items.push({
      id: 'mock.unknown.no_accuracy',
      confidence: 'unknown',
      section: null,
      data: {},
      text: 'This mock recorded your percentile but not how many questions you attempted or got right, so we cannot tell you anything about your accuracy from it.',
    });
  } else {
    items.push({
      id: 'mock.unknown.granularity',
      confidence: 'unknown',
      section: null,
      data: {},
      text: 'A scorecard shows section totals only. It cannot show which questions you got wrong, why, or how long any single question took you.',
    });
  }

  return { items, hasMeasuredAbility: measured.length > 0 };
}

/** The one line the rest of the product should lead with, or null when this
 *  mock measured nothing. Facts outrank interpretations: a student is told
 *  what happened before they are told what it might mean. */
export function headlineEvidence(evidence: MockEvidence): EvidenceItem | null {
  if (!evidence.hasMeasuredAbility) return null;
  const rank: Confidence[] = ['fact', 'inference', 'unknown'];
  for (const c of rank) {
    const hit = evidence.items.find((i) => i.confidence === c);
    if (hit) return hit;
  }
  return null;
}
