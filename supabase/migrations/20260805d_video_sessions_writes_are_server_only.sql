-- video_sessions was writable directly through PostgREST by any signed-in user.
--
-- Two holes, both reachable with nothing but the anon key that ships in the
-- client bundle plus a normal login:
--
--   "Buddies manage video sessions" was FOR ALL with check (buddy_id = uid).
--   It verified only that the row named YOU as the buddy — not that the
--   student was assigned to you. A buddy could INSERT a session onto any
--   student's dashboard, with any link, skipping every API check: assignment,
--   duration, orientation eligibility, link validation and the audit log.
--
--   "Students update own video sessions" let a student UPDATE their own rows
--   freely — including session_status. Since the booking lock is defined as
--   status in ('scheduled','active'), a student could set 'completed' to
--   release the lock, or rewrite scheduled_at and the join link.
--
-- Neither policy has any legitimate user: every write in the app goes through
-- an API route on the service-role client, which bypasses RLS entirely. They
-- were pure attack surface. Verified before dropping — no client component
-- writes this table, on this branch or on the deployed one.
--
-- SELECT is unaffected: the "Students view own video sessions" policy already
-- covers both sides (student_id = uid OR buddy_id = uid), so dropping the
-- FOR ALL policy takes nothing away from a buddy's reads.

drop policy if exists "Buddies manage video sessions" on public.video_sessions;
drop policy if exists "Students update own video sessions" on public.video_sessions;

drop policy if exists "Session participants read" on public.video_sessions;
create policy "Session participants read" on public.video_sessions
  for select
  using (student_id = (select auth.uid()) or buddy_id = (select auth.uid()));

comment on table public.video_sessions is
  'Writes are SERVER-ONLY (service role, via /api/calendar/*). No RLS write policy exists by design — the booking rules, audit trail and validation all live in those routes and in table constraints.';
