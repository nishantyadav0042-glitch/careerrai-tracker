-- ── THE ATOMIC BOOKING PROBE SUITE (Phase 2C) ───────────────────────────────
--
-- Run against careerrai-test ONLY — it deletes fixtures. Raises if any probe
-- misbehaves, so it cannot pass by being ignored.
--
-- WHAT IT IS FOR. book_session_credit() replaced an insert-then-update that had
-- no transaction across it. The claim being tested is not "the function works"
-- but "the function leaves NOTHING behind when it fails" — so every failure
-- probe asserts the state of BOTH tables afterwards, never just the return
-- value.
--
-- PROBE 10 IS THE ONE THAT MATTERS MOST. It injects a fault into the credit
-- link, after the session row already exists, and asserts the session is gone.
-- That is the founder's second scenario, and it is the failure the old code
-- handled with a best-effort compensating UPDATE that could itself fail.
--
-- WHAT THIS SUITE CANNOT PROVE, stated rather than glossed: a genuine
-- two-connection race. This environment has no second database session —
-- dblink needs a password we do not hold, and max_prepared_transactions is 0,
-- so a lock cannot be parked across sessions either. Probes 1 and 2 prove the
-- state the SECOND caller finds (a linked credit -> already_booked, no second
-- session), and the `for update` in the function is what guarantees it only
-- gets there after the first commits. The interleaving itself is proved by the
-- real ₹299 end-to-end, not here.

create or replace function public.__reset(
  p_status text default 'assigned',
  p_buddy uuid default '22222222-2222-4222-8222-222222222222'
) returns void language plpgsql as $$
begin
  delete from public.session_credits;     -- credits first: the FK is RESTRICT
  delete from public.video_sessions;
  insert into public.session_credits (id, student_id, buddy_id, payment_id, status,
                                      owner, next_action, failure_reason, failure_at)
  values ('88888888-8888-4888-8888-888888888888','11111111-1111-4111-8111-111111111111',
          p_buddy,'55555555-5555-4555-8555-555555555555', p_status,
          case when p_status in ('assignment_failed','booking_blocked') then 'ops'::public.session_credit_owner end,
          case when p_status in ('assignment_failed','booking_blocked') then 'book the session' end,
          case when p_status in ('assignment_failed','booking_blocked') then 'previous attempt failed' end,
          case when p_status in ('assignment_failed','booking_blocked') then now() end);
end $$;

-- The injected fault for probe 10.
create or replace function public.__blowup() returns trigger language plpgsql as $$
begin
  raise exception 'INJECTED FAULT: the credit link failed' using errcode='check_violation';
end $$;

-- ── fixtures ────────────────────────────────────────────────────────────────
delete from public.session_credits;
delete from public.video_sessions;
delete from public.student_payments;
delete from public.buddy_availability where buddy_id in ('22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444');
delete from public.profiles where id in (
  '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444');

insert into public.profiles (id, full_name, role) values
 ('11111111-1111-4111-8111-111111111111','Probe Student','student'),
 ('22222222-2222-4222-8222-222222222222','Probe Mentor','buddy'),
 ('33333333-3333-4333-8333-333333333333','Other Student','student'),
 ('44444444-4444-4444-8444-444444444444','Other Mentor','buddy');
insert into public.student_payments (id, student_id, amount, plan, status) values
 ('55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111',29900,'session','paid');

create temporary table probe_result (n int, label text, got text, expect text);

do $$
declare
  T timestamptz := date_trunc('hour', now()) + interval '3 days';
  S uuid := '11111111-1111-4111-8111-111111111111';
  M uuid := '22222222-2222-4222-8222-222222222222';
  M2 uuid := '44444444-4444-4444-8444-444444444444';
  O uuid := '33333333-3333-4333-8333-333333333333';
  C uuid := '88888888-8888-4888-8888-888888888888';
  o1 text; s1 uuid; o2 text; s2 uuid; d text; err text;
  nsess int; cstatus text; clink uuid; cowner text;
begin
  -- 1 & 2: the happy path, then the same call again.
  perform public.__reset();
  select outcome, session_id into o1, s1 from public.book_session_credit(C,S,M,T,45,'https://meet.example/x');
  select count(*) into nsess from public.video_sessions;
  select status, video_session_id, owner::text into cstatus, clink, cowner from public.session_credits where id=C;
  insert into probe_result values (1,'happy path books and links',
    format('%s sessions=%s status=%s linked=%s owner=%s', o1, nsess, cstatus, (clink=s1)::text, coalesce(cowner,'null')),
    'booked sessions=1 status=scheduled linked=true owner=null');

  select outcome, session_id into o2, s2 from public.book_session_credit(C,S,M,T,45,'https://meet.example/x');
  select count(*) into nsess from public.video_sessions;
  insert into probe_result values (2,'the same call again is idempotent - NO second session',
    format('%s same_session=%s sessions=%s', o2, (s2=s1)::text, nsess),
    'already_booked same_session=true sessions=1');

  -- 3: a credit that belongs to someone else. The lock predicate, not a later check.
  perform public.__reset();
  select outcome into o1 from public.book_session_credit(C,O,M,T,45,'https://meet.example/x');
  select count(*) into nsess from public.video_sessions;
  insert into probe_result values (3,'a credit that is not this student''s',
    format('%s sessions=%s', o1, nsess), 'not_eligible sessions=0');

  perform public.__reset('paid', null);
  select outcome, detail into o1, d from public.book_session_credit(C,S,null,T,45,'https://meet.example/x');
  select count(*) into nsess from public.video_sessions;
  insert into probe_result values (4,'a paid credit with no mentor',
    format('%s [%s] sessions=%s', o1, d, nsess), 'not_eligible [no mentor is assigned yet] sessions=0');

  perform public.__reset('refunded', null);
  select outcome into o1 from public.book_session_credit(C,S,null,T,45,'https://meet.example/x');
  insert into probe_result values (5,'a refunded credit', o1, 'not_eligible');

  -- 6: ops reassigned the credit while the student was choosing a time. The
  -- slots on screen belong to a different calendar.
  perform public.__reset();
  select outcome into o1 from public.book_session_credit(C,S,M2,T,45,'https://meet.example/x');
  select count(*) into nsess from public.video_sessions;
  insert into probe_result values (6,'mentor reassigned between list and tap',
    format('%s sessions=%s', o1, nsess), 'mentor_changed sessions=0');

  -- 7-9: THE INSERT FAILS. Session must not exist; credit must be untouched.
  perform public.__reset();
  insert into public.video_sessions (student_id,buddy_id,scheduled_at,duration_minutes,session_status,session_type)
    values (O,M,T,45,'scheduled','guidance');
  select outcome into o1 from public.book_session_credit(C,S,M,T,45,'https://meet.example/x');
  select count(*) into nsess from public.video_sessions;
  select status, video_session_id into cstatus, clink from public.session_credits where id=C;
  insert into probe_result values (7,'INSERT FAILS (slot taken): no new session, credit untouched',
    format('%s sessions=%s status=%s linked=%s', o1, nsess, cstatus, (clink is not null)::text),
    'slot_taken sessions=1 status=assigned linked=false');

  perform public.__reset();
  insert into public.video_sessions (student_id,buddy_id,scheduled_at,duration_minutes,session_status,session_type)
    values (S,M,T + interval '5 hours',45,'scheduled','guidance');
  select outcome into o1 from public.book_session_credit(C,S,M,T,45,'https://meet.example/x');
  select count(*) into nsess from public.video_sessions;
  select status, video_session_id into cstatus, clink from public.session_credits where id=C;
  insert into probe_result values (8,'INSERT FAILS (pair already live): no new session, credit untouched',
    format('%s sessions=%s status=%s linked=%s', o1, nsess, cstatus, (clink is not null)::text),
    'session_exists sessions=1 status=assigned linked=false');

  perform public.__reset();
  insert into public.buddy_availability (buddy_id, work_days, start_minute, end_minute, active)
    values (M, array[1,2,3,4,5]::smallint[], 540, 1080, false);
  select outcome into o1 from public.book_session_credit(C,S,M,T,45,'https://meet.example/x');
  select count(*) into nsess from public.video_sessions;
  select status into cstatus from public.session_credits where id=C;
  insert into probe_result values (9,'INSERT FAILS (mentor not taking bookings): nothing created',
    format('%s sessions=%s status=%s', o1, nsess, cstatus), 'unavailable sessions=0 status=assigned');
  delete from public.buddy_availability where buddy_id = M;

  -- 10: THE LINK FAILS AFTER THE SESSION EXISTS. The session must vanish.
  perform public.__reset();
  create trigger __blowup_guard before update on public.session_credits
    for each row execute function public.__blowup();
  begin
    select outcome into o1 from public.book_session_credit(C,S,M,T,45,'https://meet.example/x');
    err := 'NO EXCEPTION - the link failure was swallowed';
  exception when others then err := 'rolled back: ' || left(sqlerrm, 40);
  end;
  drop trigger __blowup_guard on public.session_credits;
  select count(*) into nsess from public.video_sessions;
  select status, video_session_id into cstatus, clink from public.session_credits where id=C;
  insert into probe_result values (10,'LINK FAILS after the session exists: the session must vanish',
    format('%s sessions=%s status=%s linked=%s', err, nsess, cstatus, (clink is not null)::text),
    'rolled back: INJECTED FAULT: the credit link failed sessions=0 status=assigned linked=false');

  -- 11: the recovery path Phase 2B named.
  perform public.__reset('booking_blocked');
  select outcome into o1 from public.book_session_credit(C,S,M,T,45,'https://meet.example/x');
  select status, owner::text, next_action into cstatus, cowner, d from public.session_credits where id=C;
  insert into probe_result values (11,'booking_blocked recovers and the ops debt clears',
    format('%s status=%s owner=%s action=%s', o1, cstatus, coalesce(cowner,'null'), coalesce(d,'null')),
    'booked status=scheduled owner=null action=null');

  perform public.__reset('assignment_failed', null);
  select outcome into o1 from public.book_session_credit(C,S,null,T,45,'https://meet.example/x');
  insert into probe_result values (12,'an assignment_failed credit is not bookable', o1, 'not_eligible');

  -- 13: WHO MAY CALL IT. `revoke ... from public` is NOT enough on Supabase —
  -- anon and authenticated hold EXPLICIT grants from ALTER DEFAULT PRIVILEGES,
  -- and an explicit grant survives a revoke from PUBLIC. This probe caught
  -- exactly that hole in the first version of the 2C migration.
  insert into probe_result values (13,'only service_role may call the RPC',
    format('anon=%s authenticated=%s service_role=%s',
      has_function_privilege('anon','public.book_session_credit(uuid,uuid,uuid,timestamptz,int,text,text,text)','execute')::text,
      has_function_privilege('authenticated','public.book_session_credit(uuid,uuid,uuid,timestamptz,int,text,text,text)','execute')::text,
      has_function_privilege('service_role','public.book_session_credit(uuid,uuid,uuid,timestamptz,int,text,text,text)','execute')::text),
    'anon=false authenticated=false service_role=true');
end $$;

do $$
declare bad int; detail text;
begin
  select count(*), string_agg(format(E'  #%s %s\n     expected: %s\n     got:      %s', n, label, expect, got), E'\n' order by n)
    into bad, detail from probe_result where got <> expect;
  if bad > 0 then
    raise exception E'ATOMIC BOOKING: % probe(s) misbehaved\n%', bad, detail;
  end if;
  raise notice 'atomic booking: all 13 probes behaved as specified';
end $$;

-- teardown
drop function if exists public.__reset(text, uuid);
drop function if exists public.__blowup();
delete from public.session_credits;
delete from public.video_sessions;
delete from public.student_payments;
delete from public.buddy_availability where buddy_id in ('22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444');
delete from public.profiles where id in (
  '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444');
