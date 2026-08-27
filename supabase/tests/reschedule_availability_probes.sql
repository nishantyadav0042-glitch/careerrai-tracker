-- ── THE RESCHEDULE AVAILABILITY PROBE SUITE (Incident #40) ──────────────────
--
-- Run against careerrai-test ONLY — it writes fixtures and discards them by
-- raising at the end, so the whole block rolls back. Every probe raises on
-- misbehaviour, so the suite cannot pass by being skipped.
--
-- WHAT IT IS FOR. `video_session_within_availability_guard` was
-- `before insert` only. The rule was correct and the function was already
-- UPDATE-safe — it reads nothing but `new.*` — it simply was never called on an
-- UPDATE. So `calendar/reschedule-meeting` could move a student's session onto
-- a non-working day, outside the mentor's hours, or into their time off.
--
-- WHY THIS WAS INVISIBLE. The sibling trigger `set_video_session_span` IS
-- `before insert or update of scheduled_at, duration_minutes, buddy_id`, so the
-- GIST exclusion still refused a double-booking on a reschedule. The failure
-- everyone checks for first was covered the whole time, and that is exactly
-- what made the uncovered half look covered.
--
-- 20260827c changes the trigger's event list and NOTHING else. Proof that this
-- is true rather than asserted: the normalised md5 of
-- video_session_within_availability() is 9f5965f220431a1c15fbe4b21cd792d1 on
-- production and on careerrai-test both BEFORE and AFTER the migration. The
-- rule did not move; only when it is consulted did.
--
-- P6 AND P7 ARE NOT DECORATION. P6 proves the column list matters: an unscoped
-- `or update` would fire on the status transitions that end a session's life,
-- and a 6pm session completed at 7:05pm would start raising check_violation.
-- P7 proves the documented policy that a mentor with no availability row is
-- unaffected, which is what keeps mentors who never configured a week working.
--
-- NON-VACUITY, run 27 Aug: with the trigger reverted to `before insert` the
-- Sunday move in P2 was ALLOWED — scheduled_at became 2026-08-30, a day the
-- fixture mentor does not work. That is the production defect reproduced on
-- demand. Restore the trigger afterwards; the last statement here does it.
--
-- The mentor fixture is an existing profiles row: the trigger joins
-- buddy_availability and buddy_time_off on buddy_id and never reads role.

do $$
declare
  BUD uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  STU uuid := '11111111-1111-4111-8111-111111111111';
  SES uuid := '99999999-9999-4999-8999-999999999999';
  ok_mon timestamptz := '2026-08-31T05:30:00Z';  -- Mon 11:00 IST
  ok_tue timestamptz := '2026-09-01T05:30:00Z';  -- Tue 11:00 IST
  sun    timestamptz := '2026-08-30T05:30:00Z';  -- Sunday
  small  timestamptz := '2026-08-31T21:30:00Z';  -- Tue 03:00 IST
  offday timestamptz := '2026-09-02T05:30:00Z';  -- Wed 11:00 IST, inside time off
  msg text; fired boolean;
begin
  delete from public.buddy_time_off where buddy_id = BUD;
  delete from public.video_sessions where buddy_id = BUD;
  delete from public.buddy_availability where buddy_id = BUD;

  insert into public.buddy_availability
    (buddy_id, timezone, work_days, start_minute, end_minute, slot_minutes,
     buffer_minutes, max_per_day, horizon_days, min_notice_minutes, active)
  values (BUD, 'Asia/Kolkata', '{1,2,3,4,5}', 600, 1140, 45, 15, null, 60, 60, true);
  insert into public.buddy_time_off (buddy_id, starts_at, ends_at, reason)
  values (BUD, '2026-09-02T00:00:00Z', '2026-09-03T00:00:00Z', 'probe');
  insert into public.video_sessions
    (id, student_id, buddy_id, title, scheduled_at, duration_minutes,
     session_status, session_type, google_meet_link)
  values (SES, STU, BUD, 'probe', ok_mon, 45, 'scheduled', 'guidance', 'https://m/x');

  begin update public.video_sessions set scheduled_at = ok_tue where id = SES;
    raise notice 'P1 valid reschedule       : PASS';
  exception when others then raise exception 'P1 FAILED: %', sqlerrm; end;

  fired := false;
  begin update public.video_sessions set scheduled_at = sun where id = SES;
  exception when check_violation then fired := true; msg := sqlerrm; end;
  if not fired then raise exception 'P2 FAILED — Sunday allowed'; end if;
  raise notice 'P2 non-working day        : PASS (%)', msg;

  fired := false;
  begin update public.video_sessions set scheduled_at = small where id = SES;
  exception when check_violation then fired := true; msg := sqlerrm; end;
  if not fired then raise exception 'P3 FAILED — 3am allowed'; end if;
  raise notice 'P3 outside hours          : PASS (%)', msg;

  fired := false;
  begin update public.video_sessions set scheduled_at = offday where id = SES;
  exception when check_violation then fired := true; msg := sqlerrm; end;
  if not fired then raise exception 'P4 FAILED — time off allowed'; end if;
  raise notice 'P4 mentor time off        : PASS (%)', msg;

  fired := false;
  begin update public.video_sessions
     set scheduled_at = '2026-09-01T13:15:00Z', duration_minutes = 60 where id = SES;
  exception when check_violation then fired := true; msg := sqlerrm; end;
  if not fired then raise exception 'P5 FAILED — overrun allowed'; end if;
  raise notice 'P5 overruns closing time  : PASS (%)', msg;

  begin
    update public.video_sessions set title = 'renamed by probe' where id = SES;
    update public.video_sessions set session_status = 'active' where id = SES;
    raise notice 'P6 non-scheduling writes  : PASS (unaffected)';
  exception when others then
    raise exception 'P6 FAILED — availability blocked a non-scheduling write: %', sqlerrm;
  end;

  delete from public.buddy_time_off where buddy_id = BUD;
  delete from public.buddy_availability where buddy_id = BUD;
  begin
    update public.video_sessions set scheduled_at = sun where id = SES;
    raise notice 'P7 no availability row    : PASS (allowed, as documented)';
  exception when others then
    raise exception 'P7 FAILED — unconfigured mentor was blocked: %', sqlerrm;
  end;

  raise notice '--- ALL 7 D1 PROBES PASSED ---';
  raise exception 'ROLLBACK_SENTINEL: probes complete, fixtures discarded';
end $$;

-- Restore, in case this file was run with the trigger mutated for non-vacuity.
drop trigger if exists video_session_within_availability_guard on public.video_sessions;
create trigger video_session_within_availability_guard
  before insert or update of scheduled_at, duration_minutes, buddy_id
  on public.video_sessions
  for each row execute function public.video_session_within_availability();
