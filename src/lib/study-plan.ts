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
  dailyFocus: string;
  weeklyFocus: string;
}

export const ROADMAP_PHASES: RoadmapPhase[] = [
  {
    id: 'orientation',
    label: 'Orientation & Diagnostic',
    weekRange: 'Weeks 1–2',
    objective: 'Establish an honest starting point — not a guessed one.',
    dailyFocus: 'A light diagnostic set per section — not a full mock, which this early measures panic, not skill.',
    weeklyFocus: 'One diagnostic sectional per section by the end of week 2.',
  },
  {
    id: 'foundation',
    label: 'Foundation',
    weekRange: 'Weeks 3–12',
    objective: 'Every topic reaches "can attempt correctly" at least once.',
    dailyFocus: 'One concept block + one untimed practice set, biased toward your weakest section.',
    weeklyFocus: 'Close out one "Never Started" topic per section.',
  },
  {
    id: 'strengthening',
    label: 'Strengthening',
    weekRange: 'Weeks 13–22',
    objective: 'Untimed correctness becomes timed accuracy under real pressure.',
    dailyFocus: 'Timed topic-level sets (20–25 min, CAT-realistic mix) replace untimed practice.',
    weeklyFocus: 'One sectional mock per section, always followed by a mandatory debrief.',
  },
  {
    id: 'mock_intensive',
    label: 'Mock Intensive',
    weekRange: 'Weeks 23–30',
    objective: 'Full-length mock cadence, with mandatory analysis after every one.',
    dailyFocus: 'Targeted repair — whatever your last mock’s error buckets say is weakest leads the day.',
    weeklyFocus: 'One full-length mock, non-negotiable debrief within 48 hours.',
  },
  {
    id: 'revision_sprint',
    label: 'Revision & Sprint',
    weekRange: 'Weeks 31–34',
    objective: 'Zero new topics — pure retrieval and exam-day conditioning.',
    dailyFocus: 'Error-log drilling and timed micro-sets on your own historical mistakes. No new topics.',
    weeklyFocus: 'Mock frequency tapers down, trading volume for sleep and mental conditioning.',
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

// ─── Syllabus finish projection ────────────────────────────────────────────
// "Finish syllabus — 12–17 September." One honest date window, built from a
// trailing 3-week pace (topics actually started via a logged study session,
// not a manual status flip) — never a lifetime average, never a guess. If
// pace is 0 or the projection lands after the exam, that's what gets shown —
// this never hides a bad number, it only ever pairs it with a lever instead
// of a verdict ("two extra sessions a week" instead of "you're behind").
// A fixed 6-day window (not a shrinking-with-distance one) — simpler to
// read and just as honest, since the trailing-pace input already re-derives
// fresh every time this is called.
export interface FinishProjection {
  status: 'done' | 'stalled' | 'ahead' | 'tight' | 'critical';
  windowLabel: string | null;
  rawFinishIso: string | null; // the projected finish as an ISO date — lets Home compare pace vs the student's chosen target
  sub: string;
}

const BUFFER_WEEKS_BEFORE_EXAM = 3.5;

export function projectSyllabusFinish(input: {
  today: Date;
  examDate: Date;
  topicsRemaining: number;
  topicsStartedLast21Days: number;
}): FinishProjection {
  const { today, examDate, topicsRemaining, topicsStartedLast21Days } = input;

  if (topicsRemaining === 0) {
    return { status: 'done', windowLabel: null, rawFinishIso: null, sub: "You're in revision and mocks now." };
  }

  const weeklyPace = topicsStartedLast21Days / 3;
  if (weeklyPace <= 0) {
    return { status: 'stalled', windowLabel: null, rawFinishIso: null, sub: 'Finish one topic to see your date.' };
  }

  const weeksNeeded = topicsRemaining / weeklyPace;
  const rawDate = new Date(today.getTime() + weeksNeeded * 7 * 24 * 60 * 60 * 1000);
  const start = new Date(rawDate.getTime() - 2 * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 5 * 24 * 60 * 60 * 1000);
  const sameMonth = start.getMonth() === end.getMonth();
  const windowLabel = sameMonth
    ? `${start.getDate()}–${end.getDate()} ${end.toLocaleDateString('en-GB', { month: 'long' })}`
    : `${start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;

  const rawFinishIso = rawDate.toISOString().split('T')[0];
  const bufferDate = new Date(examDate.getTime() - BUFFER_WEEKS_BEFORE_EXAM * 7 * 24 * 60 * 60 * 1000);
  if (rawDate > examDate) {
    return { status: 'critical', windowLabel, rawFinishIso, sub: 'Two extra sessions a week brings this before CAT.' };
  }
  if (rawDate > bufferDate) {
    return { status: 'tight', windowLabel, rawFinishIso, sub: 'One extra study session this week keeps you on track.' };
  }
  return { status: 'ahead', windowLabel, rawFinishIso, sub: 'Based on your current pace.' };
}

// ─── Phase boundary dates ───────────────────────────────────────────────────
// The roadmap's own thresholds (currentRoadmapIndex above), turned into real
// calendar dates instead of a "weeks remaining" number nobody converts in
// their head. These are fixed offsets from the exam date — not projected
// from pace, so there's nothing to invent: Mock Intensive starts 11 weeks
// out and Revision Sprint starts 3 weeks out, on the calendar, for everyone.
export interface PhaseBoundaries {
  mockIntensiveStart: Date;
  revisionSprintStart: Date;
}

export function phaseBoundaryDates(examDate: Date): PhaseBoundaries {
  return {
    mockIntensiveStart: new Date(examDate.getTime() - 11 * 7 * 24 * 60 * 60 * 1000),
    revisionSprintStart: new Date(examDate.getTime() - 3 * 7 * 24 * 60 * 60 * 1000),
  };
}
