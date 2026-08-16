// ── Named notification audiences ──────────────────────────────────────────
//
// Notification Reliability V2, Installment 6, P3. Motivated by a REAL
// production discrepancy, not a hypothetical: on 16 Aug the first captured
// cron run reported `reachable: 111` while the canonical metric reported
// 110. Both were correct — /api/cron/daily-heartbeat deliberately keeps test
// accounts in scope (the founder tests as a student), the canonical metric
// excludes them, and exactly one test account held a live subscription. One
// word, "reachable", two populations.
//
// An audit of all 14 notification-producing cron route files then showed the
// ambiguity is systemic, not a one-off:
//   • 2 of 14 exclude test accounts   (buddy-evening, whatsapp-backfill)
//   • 5 of 14 exclude demo accounts
//   • 7 of 14 exclude neither
//
// This file does NOT change who receives notifications — that is a product
// decision with real effect on real students, and several of those
// inclusions are deliberate and documented in the crons themselves. What it
// does is make the population a NAMED, stated thing, so that two numbers
// under one label can never again quietly mean different things.

export type AudienceName =
  /** Real students only. Excludes test accounts, demo accounts, and every
   *  non-student role. The default population for founder-facing metrics —
   *  when you ask "how many students can we reach", this is the answer. */
  | 'production_students'
  /** Real students PLUS internal test accounts, excluding demo logins.
   *  Correct for crons that are themselves the student experience being
   *  dogfooded (daily-heartbeat's own comment: "test accounts stay IN"). */
  | 'students_including_test'
  /** Every profile with role=student, no exclusions at all. Almost never
   *  what a founder-facing metric wants; named so that a surface using it
   *  has to say so out loud. */
  | 'all_student_rows';

export interface AudienceDefinition {
  name: AudienceName;
  includes: string;
  excludes: string;
  useWhen: string;
}

export const AUDIENCES: Record<AudienceName, AudienceDefinition> = {
  production_students: {
    name: 'production_students',
    includes: "role = 'student'",
    excludes: 'is_test_account = true, is_demo = true',
    useWhen: 'Any founder-facing reliability or reachability number. This is the default.',
  },
  students_including_test: {
    name: 'students_including_test',
    includes: "role = 'student', including is_test_account = true",
    excludes: 'is_demo = true',
    useWhen: 'Operational crons that are themselves the student experience under test — the population that should actually receive the send, not the population you report on.',
  },
  all_student_rows: {
    name: 'all_student_rows',
    includes: "every row with role = 'student'",
    excludes: 'nothing',
    useWhen: 'Raw integrity checks only. Never for a founder-facing metric without saying so explicitly in the label.',
  },
};

/**
 * The observed audience of every notification-producing cron, as it
 * actually behaves in code today — NOT as anyone wishes it behaved.
 * Recorded so the inconsistency is visible rather than latent, and so a
 * future change to any of these is a deliberate, reviewable edit here
 * rather than an invisible drift in one route file.
 *
 * Verified 16 Aug by direct source audit of all 14 route files.
 */
export const CRON_AUDIENCE: Record<string, AudienceName> = {
  'buddy-evening': 'production_students',
  'whatsapp-backfill': 'production_students',
  'log-yesterday-reminder': 'students_including_test',
  'daily-insight': 'students_including_test',
  'daily-heartbeat': 'students_including_test',
  'weekly-plan-reconcile': 'students_including_test',
  // Neither exclusion applied — the widest population. Flagged, not
  // silently accepted: if any of these should be narrower that is a
  // product decision, and it belongs in a reviewed change to this map.
  'onboarding-morning': 'all_student_rows',
  'daily-reminder': 'all_student_rows',
  'decision-engine': 'all_student_rows',
  'session-tomorrow': 'all_student_rows',
  'nishant-weekly': 'all_student_rows',
  'builder-recovery': 'all_student_rows',
  'study-companion': 'all_student_rows',
  'timetable-horizon': 'all_student_rows',
};
