// The visible half of the canonical 34-week CAT preparation strategy (see
// docs/product-vision-notes.md for the full Study Plan Generator design).
// Deterministic, no AI — same discipline as routine-engine.ts. This computes
// WHERE a student sits in the 5-phase roadmap; it does not (yet) change what
// tasks are generated — that stays owned by routine-engine.ts's 3-bucket
// Phase until the two are deliberately merged.

import type { Stage } from './routine-engine';
import { catExamDate } from './routine-engine';

export interface RoadmapPhase {
  id: string;
  label: string;
  weekRange: string;
  objective: string;
}

export const ROADMAP_PHASES: RoadmapPhase[] = [
  {
    id: 'orientation',
    label: 'Orientation & Diagnostic',
    weekRange: 'Weeks 1–2',
    objective: 'Establish an honest starting point — not a guessed one.',
  },
  {
    id: 'foundation',
    label: 'Foundation',
    weekRange: 'Weeks 3–12',
    objective: 'Every topic reaches "can attempt correctly" at least once.',
  },
  {
    id: 'strengthening',
    label: 'Strengthening',
    weekRange: 'Weeks 13–22',
    objective: 'Untimed correctness becomes timed accuracy under real pressure.',
  },
  {
    id: 'mock_intensive',
    label: 'Mock Intensive',
    weekRange: 'Weeks 23–30',
    objective: 'Full-length mock cadence, with mandatory analysis after every one.',
  },
  {
    id: 'revision_sprint',
    label: 'Revision & Sprint',
    weekRange: 'Weeks 31–34',
    objective: 'Zero new topics — pure retrieval and exam-day conditioning.',
  },
];

// A student already at sectionals/mocks shouldn't read as "just starting
// out" purely because their exam is still far off — but the reverse must
// never happen: someone who hasn't started with 3 weeks left still needs
// the calendar's urgency, not a false "you're on track" reassurance. Same
// advance-only principle as getPhase() in routine-engine.ts, mapped onto
// the richer 5-stage roadmap instead of the 3-bucket task-generation Phase.
const STAGE_MIN_INDEX: Record<Stage, number> = {
  not_started: 0,
  concepts: 1,
  questions: 1,
  sectionals: 3,
  mocks: 3,
};

export function weeksToExam(now: Date, attemptYear?: number | null): number {
  let year = attemptYear ?? now.getFullYear();
  if (now > catExamDate(year)) year += 1;
  const ms = catExamDate(year).getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / (7 * 86_400_000)));
}

// Weeks REMAINING, not weeks-since-start — a student's actual start date
// isn't tracked, but the exam date always is, so the roadmap is anchored to
// that instead. Thresholds mirror the 34-week canonical plan exactly.
export function currentRoadmapIndex(weeksRemaining: number, stage: Stage | null): number {
  let calendarIndex: number;
  if (weeksRemaining <= 3) calendarIndex = 4;
  else if (weeksRemaining <= 11) calendarIndex = 3;
  else if (weeksRemaining <= 21) calendarIndex = 2;
  else if (weeksRemaining <= 31) calendarIndex = 1;
  else calendarIndex = 0;

  if (stage) {
    const stageMin = STAGE_MIN_INDEX[stage];
    if (stageMin > calendarIndex) return stageMin;
  }
  return calendarIndex;
}
