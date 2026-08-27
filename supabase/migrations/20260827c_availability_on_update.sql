-- ── AVAILABILITY IS A RULE ABOUT A SESSION, NOT ABOUT AN INSERT ─────────────
--
-- Incident #40. `calendar/reschedule-meeting` moved a student's session with no
-- availability check of any kind: it validated that the timestamp parsed, that
-- it was in the future, and that the duration was legal, then wrote it. A
-- mentor could move a session onto a day they do not work, to 3am, or into
-- their own time off, and nothing refused it.
--
-- The rules were not missing. They were attached to the wrong verb. Two
-- triggers sit on video_sessions and only one of them reached an UPDATE:
--
--   set_video_session_span                   before insert OR UPDATE OF
--                                            scheduled_at, duration_minutes,
--                                            buddy_id  → the GIST exclusion
--                                            still refused a double-booking on
--                                            a reschedule.
--   video_session_within_availability_guard  before INSERT only  ← the hole.
--
-- So the failure everyone checks for first — double-booking — WAS refused the
-- whole time, which is exactly what made the uncovered half invisible. Half
-- covered reads as covered.
--
-- THE FUNCTION IS NOT TOUCHED. video_session_within_availability() already
-- reads only `new.*` and returns `new`; it was always correct on an UPDATE and
-- was simply never called on one. Rewriting it to "support" updates would have
-- invented a second definition of the mentor's week. This migration changes
-- the trigger's event list and nothing else — the whole defect was one line.
--
-- WHY THE COLUMN LIST, AND NOT A BARE `OR UPDATE`. An unscoped update trigger
-- fires on every write to the row, including the status transitions that end a
-- session's life: complete, cancel, expire. Those legitimately happen outside
-- the mentor's working hours — a 6pm session completed at 7:05pm is normal —
-- and would start raising check_violation on a row nobody is rescheduling.
-- Scoped to the three scheduling columns, the trigger fires only when the
-- session is actually being MOVED, which mirrors set_video_session_span above
-- it and keeps the two guards on the same footing.
--
-- BLAST RADIUS, from the writer inventory taken before this was written: of
-- every `.update()` against video_sessions in the codebase, exactly ONE sets
-- any of these columns — calendar/reschedule-meeting. Every other writer
-- (admin/buddy-integration, cron/release-stale-sessions, sessions/start,
-- sessions/schedule, buddy/commitment, calendar/cancel-meeting) sets only
-- session_status or google_event_id, so this trigger will never fire for them.
--
-- EXISTING ROWS ARE NOT RE-VALIDATED. A before-trigger runs on write, not on
-- rows at rest, so sessions already booked outside a mentor's current week are
-- untouched until someone tries to move one — at which point refusing is the
-- correct answer, not a regression.

drop trigger if exists video_session_within_availability_guard on public.video_sessions;
create trigger video_session_within_availability_guard
  before insert or update of scheduled_at, duration_minutes, buddy_id
  on public.video_sessions
  for each row
  execute function public.video_session_within_availability();

comment on function public.video_session_within_availability() is
  'Refuses a booking outside the mentor''s configured week, on a day they do not work, or during time off. A mentor with no availability row is unaffected. Added 24 Aug 2026 with the student-facing slot picker; extended 27 Aug 2026 to fire on UPDATE of the scheduling columns too, so a reschedule cannot bypass it (Incident #40).';
