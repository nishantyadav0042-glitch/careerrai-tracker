-- Formalizing constraints that exist in production but in NO migration.
--
-- The 21 Aug audit flagged this as unverifiable-from-the-repo: vote/route.ts
-- rests on `submission_votes_once` and report/route.ts rests on a 23505 from
-- community_reports, and `grep submission_votes_once supabase/` matched only
-- the comment claiming it. Neither table had a CREATE anywhere. Production
-- was inspected directly and BOTH constraints are present and correct:
--
--   submission_votes_once      UNIQUE (student_id, submission_id)
--   community_reports_once     UNIQUE (student_id, submission_id)
--
-- So nothing here changes live data. This file exists so the invariant the
-- code depends on is readable from the repository instead of taken on faith
-- — the same discipline as Phase 20's undeclared-columns migration. If the
-- index were ever missing, upsert(onConflict) would fail with 42P10 and
-- EVERY vote on the platform would answer "Could not save".
create unique index if not exists submission_votes_once
  on public.submission_votes (student_id, submission_id);

create unique index if not exists community_reports_once
  on public.community_reports (student_id, submission_id);
