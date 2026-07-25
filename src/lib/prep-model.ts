// ── The one hours model ─────────────────────────────────────────────────────
//
// CareerRai had two. TOPIC_METADATA (46 topics, 397h) drove everything a
// student can see — the ring, the pace, the finish date, the feasibility check
// at signup. The per-section mastery graphs (74 topics) independently implied
// 523h through their session counts: QA 267 vs 199, DILR 154 vs 92, VARC 102
// vs 106. Excluding bonus topics doesn't close it either (480h vs 397h).
//
// Neither number is obviously wrong. That isn't the problem. The problem is
// that truth has to be singular: the moment a student, a mentor or an engineer
// can find 397 and 523 in the same product, every number in it becomes a
// question. So one model is canonical and the other is not an hours model at
// all any more.
//
//   CANONICAL:     TOPIC_METADATA — hours, dates, pace, every displayed total.
//   NOT AN HOURS MODEL: the section graphs describe EVIDENCE requirements
//                       (how many sessions at each difficulty clear a stage).
//                       Nothing may sum them into an hours figure.
//
// The graphs are dormant today — 0 of 244 students have any section model
// switched on — so no student has ever seen the contradiction. The guard at
// the bottom of this file is what makes sure none ever does: a section engine
// whose implied hours have drifted from canonical refuses to run.

import { TOPIC_METADATA } from './topics-constants';
import { SESSION_MINUTES, REVISION_SESSION_MINUTES, type SectionGraph, type MasteryTopicSpec } from './mastery-engine';

export type Section = 'VARC' | 'DILR' | 'QA';
export const SECTIONS: Section[] = ['VARC', 'DILR', 'QA'];

// ── Provenance ──────────────────────────────────────────────────────────────
// Said out loud, wherever a total is shown. These hours are a planning model
// built from widely-known CAT prep conventions — they are not measured, and
// they are not a promise about a score. Students forgive an estimate that
// admits it is one; they do not forgive fake precision.
//
// Two concepts, kept deliberately distinct so neither can impersonate the
// other:
//
//   PLANNING ESTIMATE (this file, today) — a prior. What we assume a topic
//     costs before we know anything about this student. Estimating task time
//     is something humans are systematically bad at (the planning fallacy:
//     Kahneman & Tversky; Buehler et al. 1994), so this number's job is to be
//     CONSISTENT everywhere, not to be right.
//
//   BEHAVIORAL ESTIMATE (future, from topic_evidence + daily_reports) — what
//     students LIKE THIS ONE actually took to clear each rung, once enough of
//     them have logged real work. When that exists, the planning estimate does
//     not disappear — it becomes one input (the prior the observed median
//     updates), never again the whole answer.
//
// Anything that surfaces a behavioral figure must label which kind it is
// showing. The two must never be averaged into a single unlabeled number —
// that would be the two-hours-models bug reborn with better data.
export const HOURS_ARE_ESTIMATES =
  'Estimated from the CareerRai planning model — not measured data, and not a score prediction.';

/** What the hours actually mean. Never "hours to crack CAT". */
export const HOURS_MEANING = 'Hours to complete the CareerRai learning plan';

// ── Canonical hours ─────────────────────────────────────────────────────────

/** Hours for one topic, or null if it isn't in the canonical syllabus. */
export function topicHours(topic: string): number | null {
  return TOPIC_METADATA[topic]?.estimatedHours ?? null;
}

/** Every canonical topic in a section. */
export function topicsInSection(section: Section): string[] {
  return Object.entries(TOPIC_METADATA)
    .filter(([, m]) => m.section === section)
    .map(([t]) => t);
}

export interface SectionHours { section: Section; topics: number; hours: number; sharePct: number }

/** The canonical section split — VARC 106h, DILR 92h, QA 199h. */
export function sectionHours(): SectionHours[] {
  const total = totalSyllabusHours();
  return SECTIONS.map((section) => {
    const topics = topicsInSection(section);
    const hours = topics.reduce((s, t) => s + (topicHours(t) ?? 0), 0);
    return { section, topics: topics.length, hours, sharePct: total > 0 ? Math.round((hours / total) * 100) : 0 };
  });
}

/** 397h. The whole syllabus from zero, mocks excluded. */
export function totalSyllabusHours(): number {
  return Object.values(TOPIC_METADATA).reduce((s, m) => s + m.estimatedHours, 0);
}

// ── The drift guard ─────────────────────────────────────────────────────────
//
// Summing a graph's session counts is the ONE thing that recreates the second
// hours model. This function exists so that the sum has exactly one caller —
// the check that refuses to let a drifted engine run — and never a display.

/** Hours a section graph's session budget implies. For comparison only. */
export function graphImpliedHours(graph: SectionGraph<MasteryTopicSpec>, includeBonus = false): number {
  const topics = includeBonus ? graph.topics : graph.coreTopics;
  const minutes = topics.reduce((sum, t) => {
    const s = t.sessions;
    return sum
      + s.concept * SESSION_MINUTES.concept
      + s.easy * SESSION_MINUTES.easy
      + s.medium * SESSION_MINUTES.medium
      + s.hard * SESSION_MINUTES.hard
      + t.initialRevisionSessions * REVISION_SESSION_MINUTES;
  }, 0);
  return minutes / 60;
}

/**
 * How far a section's graph has drifted from canonical, as a fraction.
 * QA today: 238h implied vs 199h canonical = 0.20.
 */
export function sectionDrift(section: Section, graph: SectionGraph<MasteryTopicSpec>): number {
  const canonical = sectionHours().find((s) => s.section === section)?.hours ?? 0;
  if (canonical <= 0) return 1;
  return Math.abs(graphImpliedHours(graph) - canonical) / canonical;
}

/**
 * A section engine may only be used where its own plan agrees with the hours
 * we quote the student. 10% is the tolerance — enough that nobody re-tunes a
 * graph over rounding, tight enough that a student can never be handed a daily
 * plan whose total contradicts their own finish date.
 *
 * All three sections FAIL this today, on purpose: the reconciliation is real
 * work, and this is what stops it being skipped and discovered by a student.
 */
export const MAX_MODEL_DRIFT = 0.10;

export function isSectionReconciled(section: Section, graph: SectionGraph<MasteryTopicSpec>): boolean {
  return sectionDrift(section, graph) <= MAX_MODEL_DRIFT;
}

/** The line to log/show when a section is blocked by the guard. */
export function driftMessage(section: Section, graph: SectionGraph<MasteryTopicSpec>): string {
  const canonical = sectionHours().find((s) => s.section === section)?.hours ?? 0;
  const implied = Math.round(graphImpliedHours(graph));
  return `${section} plan model is out of sync: its sessions imply ${implied}h but the syllabus model says ${canonical}h `
    + `(${Math.round(sectionDrift(section, graph) * 100)}% drift, limit ${Math.round(MAX_MODEL_DRIFT * 100)}%).`;
}
