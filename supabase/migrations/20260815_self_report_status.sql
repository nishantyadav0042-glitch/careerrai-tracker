-- Make NOT_SURE_YET a first-class, DB-enforced state — not an indistinguishable NULL.
--
-- Founder, 15 Aug: "For a state that is now canonical product truth, I would
-- prefer the database to enforce the allowed states." The self-report
-- forensic audit found `self_reported_weakest_section = NULL` conflates at
-- least three real, different situations (pre-existence, explicit "not
-- sure", funnel abandonment) with zero way to tell them apart. This adds the
-- one distinction the product actually needs — SELECTED_SECTION vs
-- NOT_SURE_YET — enforced by CHECK constraints, not application discipline
-- alone.
--
-- Safety, proven against live data before writing this migration (not
-- assumed): of 422 profiles, 0 have a self_reported_weakest_section value
-- outside {VARC, DILR, QA}, 13 have a non-null value, 410 (incl. buddies/
-- admins) are null. A non-null value can ONLY have been written by the
-- app-layer whitelist in verify-phone-otp/route.ts or onboarding-modal.tsx,
-- both of which only ever wrote 'VARC'|'DILR'|'QA'|null — so a non-null
-- value unambiguously means the student selected a section. Backfilling
-- self_report_status='SELECTED_SECTION' for exactly those 13 rows is a
-- deterministic inference from an already-unambiguous value, not a
-- reinterpretation of a NULL. Every historical NULL (the other 409 rows,
-- including all 338 students who predate the feature entirely) is left
-- untouched — self_report_status stays NULL for them, preserving the
-- historical-null meaning exactly as it was.

alter table public.profiles
  add column if not exists self_report_status text;

-- Backfill BEFORE the constraint exists, so the ALTER below never has to
-- choose between failing on old data and being added un-validated.
update public.profiles
  set self_report_status = 'SELECTED_SECTION'
  where self_reported_weakest_section is not null
    and self_report_status is null;

-- Constraint 1: only the two canonical states, or NULL (pre-feature/unknown).
alter table public.profiles
  add constraint self_report_status_valid
  check (self_report_status is null or self_report_status in ('SELECTED_SECTION', 'NOT_SURE_YET'));

-- Constraint 2: the cross-column invariant — status and section must agree.
-- SELECTED_SECTION requires a real section; NOT_SURE_YET requires no
-- section; NULL status requires no section (a student can't have a
-- self-reported section with unknown status — every future write goes
-- through the same two code paths, both updated to set both columns
-- together).
alter table public.profiles
  add constraint self_report_status_consistent
  check (
    (self_report_status = 'SELECTED_SECTION' and self_reported_weakest_section in ('VARC', 'DILR', 'QA'))
    or (self_report_status = 'NOT_SURE_YET' and self_reported_weakest_section is null)
    or (self_report_status is null and self_reported_weakest_section is null)
  );
