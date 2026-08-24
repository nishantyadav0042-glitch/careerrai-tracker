import type { Speciality } from '@/lib/session-credit';

// ── Why the student bought this session ─────────────────────────────────────
//
// ONE VOCABULARY, TWO PROVENANCES. `finding_kind` is what the PRODUCT observed
// (mock_plateau, behind_timeline…). `session_intent` is what the STUDENT said
// they want. Different facts — a student who says "QA is weak" while the mocks
// say the real leak is DILR is the most interesting row in the table, and
// collapsing the two would erase exactly that.
//
// But they are the same KIND of fact, so they share ONE list rather than
// forking a second taxonomy. FINDING_TO_SPECIALITY already had 'section_depth'
// with nothing pointing at it — the answer to a section weakness existed
// before the question did, which is what made extension obviously right.
//
// RECON FINDING: the reason for purchase had never actually been recorded.
// /api/sessions/book accepted finding_kind and matched a mentor with it, but
// student_payments had no such column, PayableRow declared it optional, and so
// `row.finding_kind` silently read undefined on every purchase. Both
// production credits carry finding_kind = null.

export const SESSION_INTENTS = [
  'no_strategy', 'varc_weak', 'dilr_weak', 'qa_weak', 'mock_performance',
  'time_management', 'consistency', 'coaching_conflict', 'interview_prep', 'other',
] as const;
export type SessionIntent = (typeof SESSION_INTENTS)[number];

/** Product-observed findings. Same vocabulary; never offered as a choice. */
export const PRODUCT_FINDINGS = [
  'mock_plateau', 'mock_drop', 'behind_timeline', 'repeating_pattern', 'unreviewed',
] as const;
export type ProductFinding = (typeof PRODUCT_FINDINGS)[number];

export type IntentKind = SessionIntent | ProductFinding;

export const INTENT_LABEL: Record<IntentKind, string> = {
  no_strategy: 'Overall CAT strategy / study plan',
  varc_weak: 'VARC is my weak area',
  dilr_weak: 'DILR is my weak area',
  qa_weak: 'QA is my weak area',
  mock_performance: 'My mock / test performance',
  time_management: 'Time management',
  consistency: 'Consistency / daily routine',
  coaching_conflict: 'My coaching timetable clashes with my plan',
  interview_prep: 'College / IIM interview preparation',
  other: 'Something else',
  mock_plateau: 'Mock scores have plateaued',
  mock_drop: 'Mock scores dropped',
  behind_timeline: 'Behind the syllabus timeline',
  repeating_pattern: 'Repeating a past pattern',
  unreviewed: 'Not yet reviewed',
};

/**
 * Which mentor speciality answers each intent. Mirrors the DB table, which the
 * guard test reads to prove the two cannot drift.
 */
export const INTENT_TO_SPECIALITY: Record<IntentKind, Speciality> = {
  no_strategy: 'strategy',
  varc_weak: 'section_depth',
  dilr_weak: 'section_depth',
  qa_weak: 'section_depth',
  mock_performance: 'mock_analysis',
  time_management: 'strategy',
  consistency: 'consistency',
  coaching_conflict: 'strategy',
  interview_prep: 'second_attempt',
  other: 'strategy',
  mock_plateau: 'mock_analysis',
  mock_drop: 'mock_analysis',
  behind_timeline: 'strategy',
  repeating_pattern: 'second_attempt',
  unreviewed: 'strategy',
};

export function isSessionIntent(v: unknown): v is SessionIntent {
  return typeof v === 'string' && (SESSION_INTENTS as readonly string[]).includes(v);
}

/**
 * 'Something else' with no explanation teaches nothing — and it is the option a
 * student picks precisely when none of ours fit, which is the row most worth
 * reading. Also enforced by a CHECK constraint; both, deliberately.
 */
export function intentNeedsNote(intent: SessionIntent | null | undefined): boolean {
  return intent === 'other';
}

/** Minimum characters that count as an explanation rather than a shrug. */
export const MIN_NOTE_LENGTH = 3;

export function validateIntent(intent: unknown, note: unknown):
  | { ok: true; intent: SessionIntent; note: string | null }
  | { ok: false; error: string } {
  if (!isSessionIntent(intent)) {
    return { ok: false, error: 'Pick what you would like help with.' };
  }
  const text = typeof note === 'string' ? note.trim() : '';
  if (intentNeedsNote(intent) && text.length < MIN_NOTE_LENGTH) {
    return { ok: false, error: 'Tell your buddy in a few words what you need — that is the whole point of this box.' };
  }
  return { ok: true, intent, note: text.length > 0 ? text.slice(0, 500) : null };
}
