-- Same intent = same submission. (Applied 21 Aug 2026.)
--
-- The first real student contribution succeeded on the server while the
-- phone's connection died at 27s. The client reported failure, the student
-- pressed Send again, and only the one-a-day rate limit stopped a duplicate.
-- A rate limit is a guard, not request semantics.
alter table public.student_submissions add column if not exists request_id uuid;

create unique index if not exists student_submissions_request_uniq
  on public.student_submissions (student_id, request_id)
  where request_id is not null;
