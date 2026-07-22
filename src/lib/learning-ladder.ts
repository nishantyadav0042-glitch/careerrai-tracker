// Learning Ladder (Mastery Engine v1) — a topic is a climb, not a checkbox.
//
// Real-student insight (Chanchal, 22 Jul): "SI doesn't finish today; tomorrow
// CI, then medium, then hard." The unit of learning is the student's POSITION
// inside a topic's journey, not the topic. So the planner stops saying "Learn
// Simple Interest" (a false one-day finish) and says "Level Up Simple Interest ·
// Level 2/5 — Easy," keeping the student on the topic until the rung clears.
//
// FIVE simple stages (founder, 22 Jul): Concept → Easy → Medium → Hard → Exam
// Ready. They map 1:1 onto the 5 coverage states the student ALREADY sets, so
// v1 needs NO new schema. Phase 2 stores a real per-topic level and this mapping
// becomes only the seed.
//
// The difficulty ladder is a QUANT idea. It applies to DILR loosely (set-worded)
// and NOT to VARC — reading/inference/timing isn't easy-medium-hard — so VARC
// has no ladder and keeps its own plain phrasing.

import type { Section } from './routine-engine';
import type { CoverageStatus } from './topic-selector';

export type LadderLevel = 1 | 2 | 3 | 4 | 5;

// Which sections climb a difficulty ladder. VARC does not.
export function sectionHasLadder(section: Section): boolean {
  return section === 'QA' || section === 'DILR';
}

// Clean 1:1 map: the 5 coverage states → the 5 rungs.
export function levelFromStatus(status: CoverageStatus | null | undefined): LadderLevel {
  switch (status) {
    case 'exam_ready': return 5;
    case 'revising': return 4;
    case 'practicing': return 3;
    case 'learning': return 2;
    default: return 1; // not_started / null
  }
}

// Rung names. QA uses plain difficulty; DILR is set-worded. Index 0 is a
// placeholder so the array is 1-indexed. VARC is intentionally absent
// (sectionHasLadder gates it out before these are called).
const RUNGS: Partial<Record<Section, string[]>> = {
  QA:   ['', 'Concept', 'Easy', 'Medium', 'Hard', 'Exam Ready'],
  DILR: ['', 'Concept', 'Easy sets', 'Moderate sets', 'Hard sets', 'Exam Ready'],
};

export function rungName(section: Section, level: LadderLevel): string {
  return RUNGS[section]?.[level] || 'Practice';
}

export function nextRungName(section: Section, level: LadderLevel): string | null {
  return level >= 5 ? null : (RUNGS[section]?.[level + 1] || null);
}

// The difficulty word for the question copy.
export function difficultyWord(level: LadderLevel): string {
  if (level <= 2) return 'easy';
  if (level === 3) return 'medium';
  if (level === 4) return 'hard';
  return 'exam-level';
}

// Volume multiplier vs a medium (=1.0) baseline: concept and easy rungs are fast
// so ask MORE (up to ~30 easy), hard/exam are slow so ask FEWER (~12). Applied
// to both count and cap so easy days honestly reach ~30 while staying time-honest.
export function volumeMultiplier(level: LadderLevel): number {
  return [0, 1.3, 1.8, 1.0, 0.65, 0.85][level] ?? 1.0;
}

// Success criterion shown with the mission — the accuracy at which a rung is
// "cleared". Concept (level 1) has none; it's about understanding, not scoring.
export function accuracyTarget(level: LadderLevel): number {
  return [0, 0, 85, 78, 70, 75][level] || 0;
}
