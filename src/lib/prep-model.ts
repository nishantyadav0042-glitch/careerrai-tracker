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

// ── The drift guard is gone, with the thing it guarded ──────────────────────
//
// graphImpliedHours / sectionDrift / isSectionReconciled / driftMessage existed
// to stop the per-section mastery engines running while their session budgets
// disagreed with the hours we quote a student. Founder, 14 Aug: "delete —
// there should be only one way for building study plan." The engines are gone,
// so the guard has nothing left to guard, and keeping a second hours model
// alive purely to police a planner that no longer ships is how it would come
// back. sectionHours() below remains the single canonical model.
