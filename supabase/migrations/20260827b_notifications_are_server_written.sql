-- ── The delivery record is written by the server, never by the browser ──────
--
-- This PR makes the `notifications` row the authoritative answer to two
-- different questions — "was this event created?" and "did we manage to
-- deliver it?" — with per-rail stamps (pushed_at, emailed_at, send_status) on
-- the same row. That is only worth anything if the row is trustworthy.
--
-- It was not. `authenticated` held INSERT, UPDATE, DELETE, TRUNCATE,
-- REFERENCES and TRIGGER on EVERY COLUMN, and the single RLS policy was
--
--     "Users manage own notifications"  FOR ALL  USING (user_id = auth.uid())
--
-- so any signed-in student, using the public anon key from a browser console,
-- could:
--
--   · INSERT notification rows for themselves that dispatch() never created —
--     bypassing the budget, the 10/day ceiling, the channel policy and the
--     reason/expected_action discipline
--   · UPDATE any column of their own rows, including send_status, pushed_at
--     and clicked_at — FORGING the delivery record this PR relies on
--   · DELETE their own rows — destroying it
--
-- None of that crosses users: the WITH CHECK pins user_id to auth.uid(), and
-- for `anon` auth.uid() is null so RLS matches nothing. It is an INTEGRITY
-- hole, not a data breach. But an integrity hole in exactly the table we have
-- just promoted to the delivery authority is worth closing before we start
-- quoting its numbers.
--
-- WHAT THE BROWSER ACTUALLY NEEDS, from a full sweep of client code: SELECT,
-- and UPDATE of ONE column — `read`, set by notification-bell.tsx when the
-- student opens the tray. Every delivery stamp (pushed_at, emailed_at,
-- send_status, received_at, clicked_at, app_opened_at) is written by the
-- ADMIN client, which is service_role and bypasses RLS entirely, so none of
-- this touches the server's ability to write.
--
-- Column-level grants matter here and a policy alone would not do: RLS
-- decides WHICH ROWS a statement may touch, never which COLUMNS. Without
-- `grant update (read)`, an UPDATE policy scoped to the user's own rows still
-- lets them rewrite send_status on those rows.
--
-- TRUNCATE is revoked as well. It is granted today and, unlike the others, RLS
-- does not constrain it at all — a TRUNCATE ignores row policies completely.
-- It is not reachable through PostgREST (there is no TRUNCATE verb), so this
-- is defence in depth rather than a live hole, but a privilege that no path
-- needs and no policy can restrain should not be granted.
--
-- Incident #33 recorded the mechanism behind all of this: Supabase grants
-- anon/authenticated explicitly, so `revoke ... from public` does not remove
-- it. This is the same shape, on the notifications table specifically. The
-- same audit almost certainly applies to other tables and is deliberately NOT
-- attempted here — a repo-wide grant sweep is its own cycle with its own
-- verification, not a rider on this one.

-- 1. Take away everything, from both roles.
revoke all privileges on public.notifications from anon, authenticated;

-- 2. Give back exactly what the product uses.
--    SELECT stays for both: RLS already returns zero rows to anon, and keeping
--    the grant means an unauthenticated read is an empty result rather than a
--    permission error, which is what any pre-auth render already expects.
grant select on public.notifications to anon, authenticated;
--    ONE writable column, for the one thing the browser legitimately does.
--    This is a deliberate CLIENT WRITE grant, and the only one on this table:
--    notification-bell.tsx sets `read` when the student opens the tray, from
--    the user's own session. It is column-scoped precisely so that granting it
--    cannot also hand over send_status, pushed_at or emailed_at — the columns
--    that answer "did we deliver this?", which the recipient must never author.
grant update (read) on public.notifications to authenticated;

-- 3. Split the FOR ALL policy into the two verbs that remain.
drop policy if exists "Users manage own notifications" on public.notifications;

create policy "notifications_own_read"
  on public.notifications for select
  using (user_id = (select auth.uid()));

create policy "notifications_own_mark_read"
  on public.notifications for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

comment on table public.notifications is
  'The event record AND the delivery outbox. Written by the server only: '
  'clients may read their own rows and set `read`, nothing else. Delivery '
  'stamps (pushed_at, emailed_at, send_status) are service_role-only so the '
  'answer to "did we deliver this?" cannot be authored by its recipient.';
