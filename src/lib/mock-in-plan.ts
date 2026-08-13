// ── The mock score belongs to the mock ──────────────────────────────────────
//
// Founder, 13 Aug: "whenever there is a mock planned in the study plan add
// submit today's mock score in the study plan only — there is no need of a
// different button for mock."
//
// The standalone "Gave a mock" button on Home was on screen 365 days a year
// for something that happens roughly once a week. On the six days it was
// wrong it was clutter; on the seventh it was in the wrong place, two cards
// away from the mock it was about. So the door moves onto the task itself,
// and exists only on the days a mock does.
//
// WHICH tasks earn the door is the whole question, and it is not "anything
// with the word mock in it". Sitting a fresh timed paper produces percentiles
// to record. Re-opening last week's paper to note three mistakes does not —
// offering that student a score box asks them to re-enter a number they
// already gave us, or worse, to invent one.
//
// Detection reads the task id first because ids are frozen onto the stored
// routine row and never change. Labels are the fallback for the one id that
// covers two different days (`mock-or-review` is "Sectional mock" for a
// first-timer and "Mock analysis" for a repeater) and for routines generated
// before this shipped.

export interface MockCandidate {
  id: string;
  label: string;
}

/** Ids that always mean "sit a fresh paper today". */
const ALWAYS_SITTING = new Set(['exam-mock', 'weekday-sectional']);

/** Ids that are always about a paper already sat — never a new score. */
const NEVER_SITTING = new Set(['exam-mock-analysis']);

/**
 * True when today's plan asks the student to SIT a mock — i.e. when a score
 * will exist by tonight that does not exist now.
 */
export function isMockSitting(task: MockCandidate): boolean {
  if (NEVER_SITTING.has(task.id)) return false;
  if (ALWAYS_SITTING.has(task.id)) return true;

  const label = (task.label ?? '').toLowerCase();
  if (!label.includes('mock') && !label.includes('sectional')) return false;
  // Studying an existing paper, however it is worded, is not a new score.
  return !label.includes('analys') && !label.includes('review');
}

/** The first mock the student will sit today, if today has one at all. */
export function findTodaysMock<T extends MockCandidate>(tasks: readonly T[]): T | null {
  return tasks.find(isMockSitting) ?? null;
}
