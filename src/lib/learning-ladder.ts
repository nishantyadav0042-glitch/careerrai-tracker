// Learning Ladder (Mastery Engine v1) — a topic is a multi-day climb, not a
// one-day checkbox.
//
// Real-student insight (Chanchal, 22 Jul): a topic takes 3–4 days, not a day.
// So the planner keeps the student on the SAME topic, climbing 5 simple stages,
// until it's exam-ready — instead of "Learn X" then moving on as if it's done.
//
// Founder decision (22 Jul): keep it SIMPLE and TRUST the student — they know
// their own level, and if a student lies no system can help them anyway. So the
// stage is student-owned: it advances when they mark the topic done well (a
// green tap they already make). No hidden measurement, no noisy % slider.
//
// The five stages are section-appropriate — QA/DILR climb difficulty, VARC
// climbs a reading skill (difficulty isn't how RC is learned):
//   QA   : Learn concept → Easy → Medium → Hard → Exam ready
//   DILR : Learn the set type → Easy sets → Medium sets → Hard sets → Exam ready
//   VARC : Read & understand → Untimed practice → Inference & tone → Timed → Exam ready
//
// Named LadderStage (not Stage) — routine-engine already owns a `Stage` type for
// the onboarding prep-stage; these are different axes.

import type { Section } from './routine-engine';
import type { CoverageStatus, ConfidenceSignal } from './topic-selector';

export type LadderStage = 1 | 2 | 3 | 4 | 5;

const LADDER: Record<Section, readonly string[]> = {
  QA:   ['Learn concept', 'Easy', 'Medium', 'Hard', 'Exam ready'],
  DILR: ['Learn the set type', 'Easy sets', 'Medium sets', 'Hard sets', 'Exam ready'],
  VARC: ['Read & understand', 'Untimed practice', 'Inference & tone', 'Timed practice', 'Exam ready'],
};

export function stageName(section: Section, stage: LadderStage): string {
  return LADDER[section][stage - 1] ?? 'Practice';
}
export function nextStageName(section: Section, stage: LadderStage): string | null {
  return stage >= 5 ? null : (LADDER[section][stage] ?? null);
}

// Seed the ladder for a topic that has an old coverage status but no explicit
// stage yet — a clean 1:1 with the 5 statuses, so nobody restarts at zero.
export function seedStage(status: CoverageStatus | null | undefined): LadderStage {
  switch (status) {
    case 'exam_ready': return 5;
    case 'revising': return 4;
    case 'practicing': return 3;
    case 'learning': return 2;
    default: return 1;
  }
}

// Student-owned advancement (trust the student): a green "done well" tap climbs
// one rung; anything less holds the rung (repeat it tomorrow, no punishment).
// Exam-ready (5) is the top — a green there keeps them sharp, doesn't overflow.
export function advanceStage(current: LadderStage, confidence: ConfidenceSignal): LadderStage {
  if (confidence === 'green') return Math.min(5, current + 1) as LadderStage;
  return current;
}

// The difficulty word for QA/DILR question/set copy.
export function difficultyWord(stage: LadderStage): string {
  return ['easy', 'easy', 'medium', 'hard', 'exam-level'][stage - 1] ?? 'practice';
}

// Volume multiplier (QUESTIONS only) vs a medium (=1.0) baseline: easy rungs are
// fast so ask MORE (~30), hard/exam are slow so ask FEWER (~12). Sets and
// passages keep their small counts and climb via the stage name, not volume.
export function volumeMultiplier(stage: LadderStage): number {
  return [1.3, 1.8, 1.0, 0.65, 0.85][stage - 1] ?? 1;
}

// Success criterion shown with the mission. Stage 1 is about understanding, not
// scoring, so it has none.
export function accuracyTarget(stage: LadderStage): number {
  return [0, 85, 78, 70, 75][stage - 1] ?? 0;
}
