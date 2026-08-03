// What hours a log actually writes — and the one rule behind it:
//
//   SILENCE IS NOT A ZERO.
//
// The daily log's hours row is optional by design ("completion is the source of
// truth"). LoggingModal sent `hours ?? 0`, the API passed that straight into
// upsert_log_and_streak, and that RPC OVERWRITES study_duration. So a student
// who left the row alone submitted a zero that erased hours they had already
// earned by completing planned tasks — complete-task credits
// `Math.max(1, routineMinutes / 60, existing)` when a task is ticked.
//
// Abhishek completed a NINE HOUR plan on 30 Jul and his row read 0.0. The
// capacity engine then read those zeros as proof he studied nothing and cut his
// day to 30 minutes, under a headline still promising "9h needed". Twenty-eight
// such days exist across twenty students — roughly a third of everyone who has
// ever logged.
//
// study_duration is NOT NULL DEFAULT 0 in Postgres, so "unknown" cannot be
// stored. It has to be resolved before the write, which is what this does.
//
// Pure, so the rule is testable without a database and stated in exactly one
// place instead of being re-derived at each call site.

/**
 * @param stated   what the student typed. `null` = they left the row alone.
 * @param existing what the row already holds (0 when there is no row yet).
 */
export function resolveLoggedHours(stated: number | null | undefined, existing: number | null | undefined): number {
  const current = Math.max(0, Math.round(Number(existing ?? 0)));

  // Said nothing → change nothing. This is the whole fix: an untouched optional
  // field must never be able to lower a number the student earned.
  if (stated === null || stated === undefined || !Number.isFinite(stated)) return current;

  // They gave a number, so it is theirs — including a correction DOWNWARD and
  // including an honest 0 for a rest day. Deliberately not `Math.max(stated,
  // current)`: a ratchet that can only ever go up would make a mis-tapped 9h
  // permanent, and taking someone's stated hours away from them is the same
  // disrespect as ignoring their silence.
  return Math.max(0, Math.round(stated));
}
