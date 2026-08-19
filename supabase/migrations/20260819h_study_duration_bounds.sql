-- study_duration gets the bounds its own API already enforces
--
-- The column has had NO constraint of any kind: any numeric was storable,
-- including negatives and 500. That was a client-reachable hole until today's
-- G13-A4 revoke made these tables server-write-only; it is now a server-bug
-- backstop rather than an exploit surface, which is why it is hardening and
-- not urgent.
--
-- THE BOUND IS THE API'S OWN CONTRACT, not a new opinion. log-daily already
-- rejects anything outside 0..24:
--
--     if (typeof body.hours !== 'number' || !Number.isFinite(body.hours)
--         || body.hours < 0 || body.hours > 24) -> 400
--
-- Matching it exactly matters: a CHECK tighter than the API would start
-- refusing writes the API itself accepts, turning a validation error into a
-- 500 and inventing a new failure mode to fix an old one.
--
-- PROVEN AGAINST PRODUCTION BEFORE APPLYING, not assumed: across all 346 rows
-- the range is 0.0 to 12.0, with zero negatives and zero values above 16. No
-- legitimate stored value is rejected, so nothing needs rewriting -- and if
-- one had been, the rule was to report it and leave this parked rather than
-- edit data to fit a constraint.

alter table public.daily_reports
  drop constraint if exists daily_reports_study_duration_bounds;

alter table public.daily_reports
  add constraint daily_reports_study_duration_bounds
  check (study_duration >= 0 and study_duration <= 24);
