// ── Evidence, not opinions ──────────────────────────────────────────────────
//
// The old question was "what stage are you at?" and the answer was a chip a
// student tapped. Learning, Practising, Revising — the words mean whatever the
// student believed that morning, and every projection in the app was built on
// them. 11,078 of those taps exist against 96 recorded pieces of real work.
//
// This module never asks that question. It asks what the student actually did
// — how many questions, at what difficulty, how many right, how long ago — and
// DERIVES the stage. A student cannot declare Exam Ready here; they can only
// earn it, and if they ask why a number says 54% every input behind it can be
// shown back to them.
//
// What this module will never do: predict a percentile. We do not have the
// data to support "your probability of 99+ is 74%", and the fastest way to
// lose a student is to show them a number we cannot defend. Everything here is
// a statement about work completed, never about a result to come.

import { TOPIC_METADATA } from './topics-constants';
import { REMAINING_FRACTION, type CoverageStatus } from './study-pace';
import { topicHours, totalSyllabusHours, type Section } from './prep-model';

export type Difficulty = 'easy' | 'medium' | 'hard' | 'timed';
export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'timed'];

export function isDifficulty(v: unknown): v is Difficulty {
  return typeof v === 'string' && (DIFFICULTIES as string[]).includes(v);
}

/** One logged practice block, straight from topic_evidence. */
export interface EvidenceRow {
  topic: string;
  section: string;
  difficulty: Difficulty;
  attempted: number;
  correct: number;
  loggedFor: string; // ISO date
}

// ── The bars ────────────────────────────────────────────────────────────────
//
// Two numbers decide whether a rung is cleared: how much you did, and how well.
// Volume alone is what produced Problem 4 — 200 sets at 34% counting the same
// as 110 at 81%. Accuracy alone would pass a student who got 4 of 5 right once.
//
// The accuracy bars fall as difficulty rises because that is how the questions
// behave: 75% on easy questions is competence, 55% on hard ones is competence.
// These are planning assumptions, stated here once so they are arguable in one
// place rather than scattered through the UI.
export const ACCURACY_BAR: Record<Difficulty, number> = {
  easy: 0.75,
  medium: 0.65,
  hard: 0.55,
  timed: 0.60,
};

/**
 * How many questions a rung needs, scaled by the topic's own size.
 *
 * A flat "50 easy questions" would ask the same of Reading Comprehension (30h)
 * and Set Theory (5h). Volume scales with canonical hours, then clamps: the
 * floor stops a small topic being cleared on a handful of questions, the
 * ceiling stops RC demanding 180.
 */
export interface EvidenceTargets { easy: number; medium: number; hard: number; timed: number }

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));

export function targetsFor(topic: string): EvidenceTargets {
  const h = topicHours(topic) ?? 8;
  return {
    easy:   clamp(6 * h,    10, 60),
    medium: clamp(3.5 * h,   8, 40),
    hard:   clamp(1.75 * h,  5, 25),
    timed:  clamp(0.75 * h,  3, 15),
  };
}

/** How stale a topic is allowed to get before revision counts as lapsed. */
export function revisionWindowDays(topic: string): number {
  // Twice the topic's own revision cadence — one missed cycle is a slip, two
  // is genuinely out of date. Using the per-topic cadence we already hold
  // beats one flat 14-day rule for every topic in the syllabus.
  return (TOPIC_METADATA[topic]?.revisionFrequencyDays ?? 7) * 2;
}

export interface EvidenceCheck {
  id: 'concept' | 'easy' | 'medium' | 'hard' | 'revision' | 'tested';
  label: string;
  done: boolean;
  /** The audit trail — exactly why this is or isn't ticked. */
  detail: string;
}

export interface TopicEvidence {
  topic: string;
  section: Section;
  hours: number;
  checks: EvidenceCheck[];
  passed: number;
  total: number;
  /** DERIVED from the checks. Never what the student said. */
  status: CoverageStatus;
  attempted: number;
  accuracyPct: number | null;
  daysSincePractice: number | null;
}

interface Totals { attempted: number; correct: number }

function rollUp(rows: EvidenceRow[]): Record<Difficulty, Totals> {
  const out = { easy: { attempted: 0, correct: 0 }, medium: { attempted: 0, correct: 0 },
                hard: { attempted: 0, correct: 0 }, timed: { attempted: 0, correct: 0 } };
  for (const r of rows) {
    const t = out[r.difficulty];
    if (!t) continue;
    t.attempted += r.attempted;
    t.correct += r.correct;
  }
  return out;
}

const pct = (t: Totals) => (t.attempted > 0 ? t.correct / t.attempted : 0);

export interface TopicEvidenceInput {
  /** Every evidence row for this topic. */
  rows: EvidenceRow[];
  /** Did the student say they've covered the concept? The one self-reported
   *  rung — understanding a concept leaves no trace we can observe. */
  conceptReported: boolean;
  /** Most recent mock, for the "tested under pressure" rung. */
  lastMockDaysAgo: number | null;
  today?: Date;
}

export function topicEvidence(topic: string, input: TopicEvidenceInput): TopicEvidence {
  const meta = TOPIC_METADATA[topic];
  const section = (meta?.section ?? 'QA') as Section;
  const hours = topicHours(topic) ?? 0;
  const targets = targetsFor(topic);
  const totals = rollUp(input.rows);
  const today = input.today ?? new Date();

  const attempted = DIFFICULTIES.reduce((s, d) => s + totals[d].attempted, 0);
  const correct = DIFFICULTIES.reduce((s, d) => s + totals[d].correct, 0);

  const lastDate = input.rows.reduce<number | null>((max, r) => {
    const t = Date.parse(`${r.loggedFor}T00:00:00`);
    return Number.isNaN(t) ? max : max == null || t > max ? t : max;
  }, null);
  const daysSincePractice = lastDate == null
    ? null
    : Math.floor((today.getTime() - lastDate) / 86_400_000);

  // A practice rung: enough questions AND a good enough hit rate.
  const rung = (d: Exclude<Difficulty, 'timed'>, label: string): EvidenceCheck => {
    const t = totals[d];
    const need = targets[d];
    const bar = ACCURACY_BAR[d];
    const enough = t.attempted >= need;
    const accurate = pct(t) >= bar;
    return {
      id: d,
      label: `${label} — ${need} questions at ${Math.round(bar * 100)}%`,
      done: enough && accurate,
      detail: t.attempted === 0
        ? `Nothing logged yet (need ${need})`
        : `${t.correct}/${t.attempted} correct = ${Math.round(pct(t) * 100)}%`
          + (enough ? '' : ` · ${need - t.attempted} more to go`)
          + (enough && !accurate ? ` · below the ${Math.round(bar * 100)}% bar` : ''),
    };
  };

  const revisionWindow = revisionWindowDays(topic);
  const timed = totals.timed;
  const timedCleared = timed.attempted >= targets.timed && pct(timed) >= ACCURACY_BAR.timed;
  // "Tested" is satisfied by practice under the clock OR by the topic's section
  // appearing in a recent mock. Both are the same claim — that the work has met
  // exam conditions, not just a quiet desk.
  //
  // The mock route requires the student to have actually practised the topic.
  // A debrief is section-level, so without that guard one logged mock ticked
  // this box for all 46 topics at once — including ones never opened — and
  // added 20 points to the index for taking a single test. A mock can only
  // validate work that exists.
  const mockRecent = input.lastMockDaysAgo != null && input.lastMockDaysAgo <= 30 && attempted > 0;

  const checks: EvidenceCheck[] = [
    {
      id: 'concept',
      label: 'Concept covered',
      done: input.conceptReported || attempted > 0,
      detail: input.conceptReported
        ? 'You marked the concept covered'
        : attempted > 0 ? 'Inferred from logged practice' : 'Not started',
    },
    rung('easy', 'Easy'),
    rung('medium', 'Medium'),
    rung('hard', 'Hard'),
    {
      id: 'revision',
      label: `Revised in the last ${revisionWindow} days`,
      done: daysSincePractice != null && daysSincePractice <= revisionWindow,
      detail: daysSincePractice == null
        ? 'No practice logged'
        : daysSincePractice === 0 ? 'Practised today' : `Last practised ${daysSincePractice} days ago`,
    },
    {
      id: 'tested',
      label: 'Tested under exam conditions',
      done: timedCleared || mockRecent,
      detail: timedCleared
        ? `${timed.correct}/${timed.attempted} timed at ${Math.round(pct(timed) * 100)}%`
        : mockRecent ? `${section} appeared in a mock ${input.lastMockDaysAgo} days ago`
        : `Needs ${targets.timed} timed questions at ${Math.round(ACCURACY_BAR.timed * 100)}%, or a recent mock`,
    },
  ];

  const passed = checks.filter((c) => c.done).length;

  return {
    topic, section, hours, checks, passed, total: checks.length,
    status: deriveStatus(checks),
    attempted,
    accuracyPct: attempted > 0 ? Math.round((correct / attempted) * 100) : null,
    daysSincePractice,
  };
}

/**
 * The stage, computed. This is the whole point of the module: 'exam_ready' is
 * what six ticks look like, not what a student typed. Nothing that writes to
 * topic_coverage may set it any other way.
 */
export function deriveStatus(checks: EvidenceCheck[]): CoverageStatus {
  const has = (id: EvidenceCheck['id']) => checks.find((c) => c.id === id)?.done === true;
  if (checks.every((c) => c.done)) return 'exam_ready';
  if (has('hard')) return 'revising';
  if (has('easy') || has('medium')) return 'practicing';
  if (has('concept')) return 'learning';
  return 'not_started';
}

const STATUS_RANK: CoverageStatus[] = ['not_started', 'learning', 'practicing', 'revising', 'exam_ready'];

/**
 * What to write back to topic_coverage after new evidence lands.
 *
 * Evidence may only move a topic FORWARD. Every student on the app today has
 * declared statuses and almost no evidence, so writing the derived status
 * straight back would knock 209 students down to 'not_started' the day this
 * ships — punishing them for a data model they never chose. Evidence earns
 * ground; it never takes it away.
 *
 * The single exception in the other direction is the one that matters:
 * 'exam_ready' is reachable ONLY when all six checks pass, so it can never be
 * inherited from a declaration.
 */
export function mergeStatus(declared: CoverageStatus, derived: CoverageStatus): CoverageStatus {
  if (derived === 'exam_ready') return 'exam_ready';
  const floor = declared === 'exam_ready' ? 'revising' : declared;
  return STATUS_RANK.indexOf(derived) > STATUS_RANK.indexOf(floor) ? derived : floor;
}

// ── The four honest meters ──────────────────────────────────────────────────
//
// One ring reading "78% complete" was a single number doing four jobs badly.
// It said "I ticked things", and students read it as "I know things". Split
// apart, each number means one thing and can be checked:
//
//   Coverage    what you SAY you've covered      (declared — the weakest signal)
//   Evidence    rungs actually cleared            (the real one)
//   Revision    how much of it is still fresh
//   Mock        how much has met exam conditions
//
// Weighted by canonical hours, so Reading Comprehension (30h) moves the needle
// six times as much as Set Theory (5h) — a topic count would let a student
// "finish" the syllabus by clearing the cheapest half of it.

export interface PreparationIndex {
  coveragePct: number;
  evidencePct: number;
  revisionPct: number;
  mockPct: number;
  /** The blend. NOT a percentile, NOT a prediction. */
  index: number;
  /** Plain-language audit of how index was reached. */
  basis: string;
  topicsWithEvidence: number;
  topicsTotal: number;
}

// Stated here so the number is always explainable. Evidence dominates because
// it is the only component that reflects work we can actually see; declared
// coverage is kept at a token weight precisely because it is an opinion.
export const INDEX_WEIGHTS = { evidence: 0.50, revision: 0.20, mock: 0.20, coverage: 0.10 };

export interface PreparationInput {
  /** Declared statuses, topic → status. */
  declared: Record<string, CoverageStatus>;
  /** All evidence rows for the student. */
  rows: EvidenceRow[];
  /** Days since the most recent mock debrief, per section. */
  lastMockDaysAgoBySection: Partial<Record<Section, number>>;
  today?: Date;
}

export function preparationIndex(input: PreparationInput): PreparationIndex {
  const total = totalSyllabusHours();
  const byTopic = new Map<string, EvidenceRow[]>();
  for (const r of input.rows) {
    const list = byTopic.get(r.topic);
    if (list) list.push(r); else byTopic.set(r.topic, [r]);
  }

  let coverageH = 0, evidenceH = 0, revisionH = 0, mockH = 0, withEvidence = 0;

  for (const [topic, meta] of Object.entries(TOPIC_METADATA)) {
    const h = meta.estimatedHours;
    const declared = input.declared[topic] ?? 'not_started';
    // Declared coverage, in the same currency the pace engine already uses:
    // 1 − the fraction of the topic still ahead at that status.
    coverageH += h * (1 - (REMAINING_FRACTION[declared] ?? 1));

    const rows = byTopic.get(topic) ?? [];
    if (rows.length > 0) withEvidence += 1;

    const ev = topicEvidence(topic, {
      rows,
      conceptReported: declared !== 'not_started',
      lastMockDaysAgo: input.lastMockDaysAgoBySection[meta.section as Section] ?? null,
      today: input.today,
    });

    evidenceH += h * (ev.passed / ev.total);
    if (ev.checks.find((c) => c.id === 'revision')?.done) revisionH += h;
    if (ev.checks.find((c) => c.id === 'tested')?.done) mockH += h;
  }

  const asPct = (h: number) => (total > 0 ? Math.round((h / total) * 100) : 0);
  const coveragePct = asPct(coverageH);
  const evidencePct = asPct(evidenceH);
  const revisionPct = asPct(revisionH);
  const mockPct = asPct(mockH);

  const index = Math.round(
    evidencePct * INDEX_WEIGHTS.evidence +
    revisionPct * INDEX_WEIGHTS.revision +
    mockPct * INDEX_WEIGHTS.mock +
    coveragePct * INDEX_WEIGHTS.coverage,
  );

  return {
    coveragePct, evidencePct, revisionPct, mockPct, index,
    basis: `${Math.round(INDEX_WEIGHTS.evidence * 100)}% evidence, `
      + `${Math.round(INDEX_WEIGHTS.revision * 100)}% revision freshness, `
      + `${Math.round(INDEX_WEIGHTS.mock * 100)}% exam-condition testing, `
      + `${Math.round(INDEX_WEIGHTS.coverage * 100)}% self-declared coverage — weighted by topic hours.`,
    topicsWithEvidence: withEvidence,
    topicsTotal: Object.keys(TOPIC_METADATA).length,
  };
}

/** What the index is, in one line a student can read. Never a prediction. */
export const INDEX_MEANING =
  'Your Preparation Index measures the evidence you have built, not your CAT score. We do not predict percentiles.';
