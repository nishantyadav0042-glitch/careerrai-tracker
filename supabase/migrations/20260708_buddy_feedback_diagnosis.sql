-- Buddy-teaches-the-engine: 3 optional taps on top of the existing feedback
-- form (Knowledge/Consistency/Strategy issue, weak section, confidence
-- delta). This is the seed of a real, outcome-labeled dataset — the thing
-- that would eventually let any of the state-model thresholds be validated
-- against reality instead of guessed. Nullable and optional: never blocks
-- the existing feedback flow buddies already rely on.
alter table buddy_feedback
  add column if not exists diagnosis_issue text
    check (diagnosis_issue is null or diagnosis_issue in ('knowledge', 'consistency', 'strategy')),
  add column if not exists diagnosis_section text
    check (diagnosis_section is null or diagnosis_section in ('VARC', 'DILR', 'QA')),
  add column if not exists diagnosis_confidence text
    check (diagnosis_confidence is null or diagnosis_confidence in ('improved', 'same', 'worse'));
