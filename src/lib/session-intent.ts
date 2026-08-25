import { FINDING_TO_SPECIALITY, type Speciality } from '@/lib/session-credit';

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
 * Which mentor speciality answers each intent.
 *
 * NOT a second map — this IS FINDING_TO_SPECIALITY, re-exported under the name
 * that reads correctly at the call site. A rival table here would drift from
 * the one matchMentor actually consults, and the first symptom would be
 * students quietly matched to the wrong mentor.
 */
export const INTENT_TO_SPECIALITY = FINDING_TO_SPECIALITY as Record<IntentKind, Speciality>;

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

/**
 * How many reasons one 45-minute session may carry.
 *
 * Founder's call, 25 Aug 2026, and a product limit rather than a guess dressed
 * as one: a session that promises ten things delivers none. Enforced here, in
 * the API, and by session_intent_multi_coherent() in the database — a cap that
 * lives only in a form is a suggestion.
 */
export const MAX_INTENTS = 3;

/**
 * Validate the reasons a student stated. THE REASON IS STILL MANDATORY.
 *
 * What changed on 25 Aug 2026 is only the arity: a student may state up to
 * MAX_INTENTS reasons, because "my QA is weak AND I've lost my routine" is the
 * normal case and forcing one choice threw away the second half of it.
 *
 * ORDER IS MEANING. The first pick is the PRIMARY: it is what lands in
 * `session_intent`, and it is the single key matchMentor() reads. The picker
 * says so out loud, so the student — not an arbitrary sort — decides which of
 * their problems chooses the buddy.
 *
 * Every rule here is mirrored by a database trigger rather than trusted to
 * this function alone, because this is not the only writer that will ever
 * exist. What the trigger cannot do is produce a sentence a student should
 * read, which is why both exist.
 */
export function validateIntents(intents: unknown, note: unknown):
  | { ok: true; intents: SessionIntent[]; primary: SessionIntent; note: string | null }
  | { ok: false; error: string } {
  // A bare string is still accepted: older clients (and any surface not yet
  // migrated) send one reason, and one reason is a list of one.
  const raw = typeof intents === 'string' ? [intents] : intents;
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: 'Pick what you would like help with.' };
  }
  if (raw.length > MAX_INTENTS) {
    return { ok: false, error: `Pick up to ${MAX_INTENTS} — one session cannot fix more than that properly.` };
  }
  if (!raw.every(isSessionIntent)) {
    return { ok: false, error: 'Pick what you would like help with.' };
  }
  const list = raw as SessionIntent[];
  // Deduplicate WITHOUT reordering: the first occurrence wins, so the primary
  // survives. A Set built from the array preserves insertion order.
  const unique = [...new Set(list)];
  if (unique.length !== list.length) {
    return { ok: false, error: 'That reason is already on the list.' };
  }

  const text = typeof note === 'string' ? note.trim() : '';
  // 'other' ANYWHERE needs the note, not just as the primary — picking a real
  // reason and then "Something else" with nothing written is the combination
  // that carries no information, and the old single-value check could not see
  // it.
  if (unique.some((i) => intentNeedsNote(i)) && text.length < MIN_NOTE_LENGTH) {
    return { ok: false, error: 'Tell your buddy in a few words what you need — that is the whole point of this box.' };
  }
  return { ok: true, intents: unique, primary: unique[0], note: text.length > 0 ? text.slice(0, 500) : null };
}
